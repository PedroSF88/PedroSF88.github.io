describe('update_outline v2', () => {
  const url = 'https://hhlzhoqwlqsiefyiuqmg.functions.supabase.co/functions/v1/update_outline';
  const authHeader = { Authorization: 'Bearer TEST_KEY', 'content-type': 'application/json' };

  beforeEach(() => {
    jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('saves a v2 draft', async () => {
    const draftPayload = { topic_id: '00000000-0000-0000-0000-000000000000', draft: { foo: 'bar' }, schema_version: 2 };
    (global.fetch as unknown as jest.Mock).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ ok: true, mode: 'draft', schema_version: 2 })
    });

    const res = await fetch(url, { method: 'POST', headers: authHeader, body: JSON.stringify(draftPayload) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, mode: 'draft', schema_version: 2 });

    const fetchMock = global.fetch as unknown as jest.Mock;
    const bodySent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(bodySent.schema_version).toBe(2);
    expect(bodySent.draft).toBeDefined();
    expect(bodySent.publish).toBeUndefined();
  });

  it('publishes a v2 draft', async () => {
    const publishPayload = { topic_id: '00000000-0000-0000-0000-000000000000', publish: true, schema_version: 2 };
    (global.fetch as unknown as jest.Mock).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ ok: true, mode: 'published', schema_version: 2 })
    });

    const res = await fetch(url, { method: 'POST', headers: authHeader, body: JSON.stringify(publishPayload) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, mode: 'published', schema_version: 2 });

    const fetchMock = global.fetch as unknown as jest.Mock;
    const bodySent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(bodySent.schema_version).toBe(2);
    expect(bodySent.publish).toBe(true);
    expect(bodySent.draft).toBeUndefined();
  });
});
