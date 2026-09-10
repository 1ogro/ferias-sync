import subprocess,concurrent.futures,json
base=['psql','-X','-h','/tmp/browser/pulse-dedupe/socket','-p','55439','-U','lovable','-d','weekly_test','-v','ON_ERROR_STOP=1','-Atc']
def query(sql): return subprocess.check_output(base+[sql],text=True).strip()
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 rows=list(pool.map(lambda i: query("select (ensure_weekly_pulse_run('6a8e78a7-5fbf-4e2e-bff4-918109b05f5f','2026-08-24T13:00:00Z')).id"),range(16)))
assert len(set(rows))==1,rows
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 list(pool.map(lambda i: query("select submit_pulse_response('00000000-0000-0000-0000-000000000011','6a8e78a7-5fbf-4e2e-bff4-918109b05f5f','third',extract(epoch from '2026-09-10T10:00:00Z'::timestamptz)+%d,'concurrent-%d',%d)"%(i,i,1+i%5)),range(16)))
assert query("select count(*)||':'||max(scale_value)||':'||max(last_event_id) from pulse_responses where respondent_id='third'")=='1:1:concurrent-15'
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 claims=list(pool.map(lambda i:query("select claim_weekly_pulse_dispatch('00000000-0000-0000-0000-000000000011',gen_random_uuid())"),range(8)))
assert claims.count('t')==1,claims
print('PASS: 16 concurrent cycle resolutions, 16 reordered answers, 8 competing dispatches')
