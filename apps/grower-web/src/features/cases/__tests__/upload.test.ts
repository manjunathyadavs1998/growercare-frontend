import { server } from '@gc/test-utils';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressImage, kindOf, sha256Hex, signedHeaders, targetSize, uploadAttachment } from '../upload';

const API = 'http://localhost/api';

describe('SPEC-FE-02 D3 photos are made smaller before upload', () => {
  it.each([
    ['a 4000×3000 photo', 4000, 3000, 1600, 1200],
    ['a 3000×4000 portrait', 3000, 4000, 1200, 1600],
    ['a 1000×800 photo is never enlarged', 1000, 800, 1000, 800],
  ])('FE-E106 %s', (_name, w, h, tw, th) => {
    expect(targetSize(w, h)).toEqual({ width: tw, height: th });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('FE-E106 an image is re-encoded as JPEG at the target size; a PDF is kept', async () => {
    const drawn: number[][] = [];
    vi.stubGlobal('createImageBitmap', async () => ({ width: 4000, height: 3000, close: () => undefined }));
    vi.stubGlobal('OffscreenCanvas', class {
      constructor(public width: number, public height: number) {}
      getContext() { return { drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => drawn.push([w, h]) }; }
      async convertToBlob(options: { type: string }) { return new Blob(['jpeg-bytes'], { type: options.type }); }
    });
    const photo = await compressImage(new File([new Uint8Array(6_000_000)], 'leaf.png', { type: 'image/png' }));
    expect(photo.type).toBe('image/jpeg');
    expect(photo.name).toBe('leaf.jpg');
    expect(photo.size).toBeLessThan(2_000_000);
    expect(drawn).toEqual([[1600, 1200]]);
    const pdf = new File(['%PDF-1.7'], 'invoice.pdf', { type: 'application/pdf' });
    expect(await compressImage(pdf)).toBe(pdf);
  });

  it('kinds and checksums', async () => {
    expect(kindOf(new File([''], 'a.pdf', { type: 'application/pdf' }))).toBe('INVOICE');
    expect(kindOf(new File([''], 'a.jpg', { type: 'image/jpeg' }))).toBe('PHOTO');
    expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('SPEC-FE-02 R112 every signed header is sent once', () => {
  it.each([
    ['lower-case content-type from the presigned URL', { 'content-type': 'image/jpeg', 'x-amz-checksum-sha256': 'abc' }],
    ['Content-Type from the presigned URL', { 'Content-Type': 'image/jpeg' }],
    ['no Content-Type in the presigned headers', {}],
  ])('FE-E113 %s → one Content-Type', (_name, presigned) => {
    const headers = signedHeaders(presigned as Record<string, string>, 'image/jpeg');
    expect(headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('FE-E113 the PUT itself carries one Content-Type', async () => {
    let contentType: string | null = null;
    server.use(
      http.post(`${API}/cases/cases/:id/attachments`, () => HttpResponse.json({ attachmentId: '503',
        upload: { method: 'PUT', url: 'http://storage.local/y', headers: { 'content-type': 'application/pdf' } } }, { status: 201 })),
      http.put('http://storage.local/y', ({ request }) => { contentType = request.headers.get('content-type'); return new HttpResponse(null, { status: 200 }); }),
      http.post(`${API}/cases/cases/:id/attachments/:att/complete`, () => HttpResponse.json({ attachmentId: '503', status: 'PENDING' })),
    );
    await uploadAttachment('1', new File(['%PDF-1.7'], 'a.pdf', { type: 'application/pdf' }));
    expect(contentType).toBe('application/pdf');
  });
});

describe('SPEC-CASE-05 upload from the browser', () => {
  it('FE-E106 request → PUT to storage with the signed headers → complete', async () => {
    const calls: string[] = [];
    let declared: unknown;
    let putHeaders: Headers | undefined;
    server.use(
      http.post(`${API}/cases/cases/:id/attachments`, async ({ request }) => {
        declared = await request.json();
        calls.push('request');
        return HttpResponse.json({ attachmentId: '501', status: 'AWAITING_UPLOAD',
          upload: { method: 'PUT', url: 'http://storage.local/case-staging/501', headers: { 'Content-Type': 'application/pdf', 'x-amz-checksum-sha256': 'abc' } } }, { status: 201 });
      }),
      http.put('http://storage.local/case-staging/501', ({ request }) => {
        putHeaders = request.headers;
        calls.push('put');
        return new HttpResponse(null, { status: 200 });
      }),
      http.post(`${API}/cases/cases/:id/attachments/:att/complete`, () => {
        calls.push('complete');
        return HttpResponse.json({ attachmentId: '501', status: 'PENDING' });
      }),
    );
    const pdf = new File(['%PDF-1.7 evidence'], 'invoice.pdf', { type: 'application/pdf' });
    expect(await uploadAttachment('116446854583812124', pdf)).toBe('501');
    expect(calls).toEqual(['request', 'put', 'complete']);
    expect(declared).toEqual({ kind: 'INVOICE', contentType: 'application/pdf', sizeBytes: pdf.size, sha256: await sha256Hex(pdf) });
    expect(putHeaders?.get('x-amz-checksum-sha256')).toBe('abc');
    expect(putHeaders?.get('Authorization')).toBeNull();                     // the token never goes to storage
  });

  it('a refused PUT is an error and nothing is completed', async () => {
    let completed = false;
    server.use(
      http.post(`${API}/cases/cases/:id/attachments`, () => HttpResponse.json({ attachmentId: '502', upload: { method: 'PUT', url: 'http://storage.local/x', headers: {} } }, { status: 201 })),
      http.put('http://storage.local/x', () => new HttpResponse(null, { status: 403 })),
      http.post(`${API}/cases/cases/:id/attachments/:att/complete`, () => { completed = true; return HttpResponse.json({}); }),
    );
    await expect(uploadAttachment('1', new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }))).rejects.toMatchObject({ code: 'UPLOAD_FAILED' });
    expect(completed).toBe(false);
  });
});
