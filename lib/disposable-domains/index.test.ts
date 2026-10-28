import { describe, expect, it } from "vitest";
import { isDisposableEmail } from "./index";

describe("isDisposableEmail", () => {
  it("chytí známé jednorázové domény i subdomény a velká písmena", () => {
    for (const e of ["a@mailinator.com", "b@10minutemail.com", "c@GuerrillaMail.com", "d@yopmail.com", "e@x.mailinator.com"])
      expect(isDisposableEmail(e), e).toBe(true);
  });
  it("běžné domény pustí", () => {
    for (const e of ["a@seznam.cz", "b@gmail.com", "c@kompas-test.cz", "d@mailinator.com.example.cz", "bez-zavinace"])
      expect(isDisposableEmail(e), e).toBe(false);
  });
});
