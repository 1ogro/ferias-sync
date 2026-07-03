import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findRecentDuplicate, normalizeMessage, DEDUP_WINDOW_SECONDS, type KudoLike } from "./lib.ts";

const NOW = Date.parse("2026-07-03T00:06:00.000Z");
const iso = (offsetSec: number) => new Date(NOW + offsetSec * 1000).toISOString();

const baseCandidate = {
  from_person_id: "pessoa_010",
  to_person_id: "pessoa_007",
  message: "Muito obrigada pela ajuda!",
  category: "teamwork",
};

Deno.test("normalizeMessage trims and collapses whitespace", () => {
  assertEquals(normalizeMessage("  hello   world  "), "hello world");
  assertEquals(normalizeMessage("hello\n\nworld"), "hello world");
});

Deno.test("findRecentDuplicate: identical kudo inside window is a duplicate", () => {
  const recent: KudoLike[] = [{
    id: "k1",
    from_person_id: "pessoa_010",
    to_person_id: "pessoa_007",
    message: "Muito obrigada pela ajuda!",
    category: "teamwork",
    created_at: iso(-10),
  }];
  const hit = findRecentDuplicate(baseCandidate, recent, NOW);
  assert(hit !== null);
  assertEquals(hit!.id, "k1");
});

Deno.test("findRecentDuplicate: different category is NOT a duplicate", () => {
  const recent: KudoLike[] = [{
    id: "k1",
    from_person_id: "pessoa_010",
    to_person_id: "pessoa_007",
    message: "Muito obrigada pela ajuda!",
    category: "delivery",
    created_at: iso(-10),
  }];
  assertEquals(findRecentDuplicate(baseCandidate, recent, NOW), null);
});

Deno.test("findRecentDuplicate: message differing only by whitespace is a duplicate", () => {
  const recent: KudoLike[] = [{
    id: "k1",
    from_person_id: "pessoa_010",
    to_person_id: "pessoa_007",
    message: "  Muito obrigada    pela ajuda!  ",
    category: "teamwork",
    created_at: iso(-5),
  }];
  assert(findRecentDuplicate(baseCandidate, recent, NOW) !== null);
});

Deno.test("findRecentDuplicate: outside the window is NOT a duplicate", () => {
  const recent: KudoLike[] = [{
    id: "k1",
    from_person_id: "pessoa_010",
    to_person_id: "pessoa_007",
    message: "Muito obrigada pela ajuda!",
    category: "teamwork",
    created_at: iso(-(DEDUP_WINDOW_SECONDS + 5)),
  }];
  assertEquals(findRecentDuplicate(baseCandidate, recent, NOW), null);
});

Deno.test("findRecentDuplicate: different recipient is NOT a duplicate", () => {
  const recent: KudoLike[] = [{
    id: "k1",
    from_person_id: "pessoa_010",
    to_person_id: "pessoa_099",
    message: "Muito obrigada pela ajuda!",
    category: "teamwork",
    created_at: iso(-5),
  }];
  assertEquals(findRecentDuplicate(baseCandidate, recent, NOW), null);
});

Deno.test("findRecentDuplicate: different sender is NOT a duplicate", () => {
  const recent: KudoLike[] = [{
    id: "k1",
    from_person_id: "pessoa_999",
    to_person_id: "pessoa_007",
    message: "Muito obrigada pela ajuda!",
    category: "teamwork",
    created_at: iso(-5),
  }];
  assertEquals(findRecentDuplicate(baseCandidate, recent, NOW), null);
});
