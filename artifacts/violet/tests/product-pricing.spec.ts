import { expect, test } from "@playwright/test";
import {
  calculateRetailPrice,
  isValidMarkupPercentage,
  resolveRetailPrice,
} from "../src/lib/product-pricing";

test.describe("product markup pricing", () => {
  test("calculates retail price from cost and markup percentage", () => {
    expect(calculateRetailPrice(100, 25)).toBe(125);
    expect(calculateRetailPrice(80, "12.5")).toBe(90);
  });

  test("rounds calculated prices to cents", () => {
    expect(calculateRetailPrice(19.99, 10)).toBe(21.99);
    expect(calculateRetailPrice(12.34, 15)).toBe(14.19);
  });

  test("accepts only markup values from 0% through 100%", () => {
    expect(isValidMarkupPercentage(0)).toBe(true);
    expect(isValidMarkupPercentage(100)).toBe(true);
    expect(isValidMarkupPercentage("")).toBe(false);
    expect(isValidMarkupPercentage("   ")).toBe(false);
    expect(isValidMarkupPercentage(-1)).toBe(false);
    expect(isValidMarkupPercentage(100.01)).toBe(false);
    expect(isValidMarkupPercentage("not-a-number")).toBe(false);
    expect(calculateRetailPrice(100, -1)).toBeNull();
    expect(calculateRetailPrice(100, 101)).toBeNull();
  });

  test("keeps manual retail-price entry unchanged", () => {
    expect(resolveRetailPrice({
      mode: "manual",
      manualPrice: 37.45,
      costPrice: 20,
      markupPercentage: 50,
    })).toBe(37.45);
  });
});