# Weekly pulse regression tests

Only run these fixtures in a disposable PostgreSQL database, never production.

1. Install `weekly_pulse_schema.sql` (omit the role declarations if they already exist).
2. Seed `weekly_pulse_fixture.sql` before installing the weekly consolidation migration.
3. Install the wellbeing report and privacy migrations, then the weekly consolidation migration. The latter also expects `get_pulse_weekly_trend` with São Paulo dates.
4. Run `weekly_pulse_dedupe.sql`: historical latest-wins, preserved comment/date, repeated and reordered events, aliases, separate weeks/checkouts/peer subjects, counters, points and permissions.
5. Run `weekly_pulse_concurrency.py` against the disposable fixture socket: sixteen competing cycle resolutions, sixteen reordered answers and eight competing dispatch claims. This test changes fixture data and should run last.
6. Run existing `wellbeing_privacy.sql` in its separate privacy fixture (intentionally permits repeated raw answers to test distinct-person protection).
7. Run the Slack `resolve-pulse_test.ts` Deno tests.

Validated September 10, 2026: SQL assertions, concurrency checks, all ten Deno tests and privacy assertions passed. Browser fixture verified two weekly rows, joined note/comment, 50% participation and filtered CSV. Authenticated end-to-end Slack testing was unavailable on the external Supabase connection.
