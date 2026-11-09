import { describe, it, expect } from "vitest";
import { listOrderBy, parseListPage, PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/transactions/query";

const q = (s: string) => parseListPage(new URLSearchParams(s));

describe("paginação da lista de transações", () => {
  it("padrão: 50 por página, do começo, por data", () => {
    expect(q("")).toEqual({ limit: PAGE_SIZE, offset: 0, sort: null, lens: "EUR" });
    expect(PAGE_SIZE).toBe(50);
  });

  it("limite com teto e piso; offset inválido volta a 0", () => {
    expect(q("limit=5000").limit).toBe(MAX_PAGE_SIZE);
    expect(q("limit=0").limit).toBe(1);
    expect(q("limit=abc").limit).toBe(PAGE_SIZE);
    expect(q("offset=-3").offset).toBe(0);
    expect(q("offset=100").offset).toBe(100);
  });

  it("ordenação só por campos conhecidos; valor na moeda da lente", () => {
    expect(q("sort=value:asc&lens=BRL").sort).toEqual({ key: "value", dir: "asc" });
    expect(q("sort=password:asc").sort).toBeNull();
    expect(listOrderBy(q("sort=value:asc&lens=BRL"))[0]).toEqual({ amountBRL: "asc" });
    expect(listOrderBy(q("sort=description:desc"))[0]).toEqual({ description: "desc" });
  });

  it("toda ordem termina no id: páginas por offset não repetem nem pulam linhas", () => {
    for (const s of ["", "sort=value:desc", "sort=description:asc"]) {
      expect(listOrderBy(q(s)).at(-1)).toEqual({ id: "desc" });
    }
  });
});

describe("filtros do cartão", () => {
  it("lê só valores conhecidos de `card` e repassa a conta", async () => {
    const { parseFilters, buildWhere } = await import("@/lib/transactions/query");
    const f = parseFilters(new URLSearchParams("bank=Nubank&account=Cart%C3%A3o%20de%20cr%C3%A9dito&card=only"));
    expect(buildWhere("u1", f)).toMatchObject({ bank: "Nubank", account: "Cartão de crédito", isCard: true });
    expect(buildWhere("u1", parseFilters(new URLSearchParams("card=exclude")))).toMatchObject({ isCard: false });
    expect(buildWhere("u1", parseFilters(new URLSearchParams("card=talvez")))).not.toHaveProperty("isCard");
  });
});
