import { describe, expect, it } from "vitest";
import { addDays, arDateTime, diffDays, formatDate, formatTime, todayAR, weekday } from "./dates";

describe("fechas", () => {
  it("suma y resta días", () => {
    expect(addDays("2026-10-03", 5)).toBe("2026-10-08");
    expect(addDays("2026-10-03", -31)).toBe("2026-09-02");
    expect(diffDays("2026-09-21", "2026-10-03")).toBe(12);
  });
  it("sabe el día de la semana", () => {
    expect(weekday("2026-10-03")).toBe(6); // sábado
    expect(weekday("2026-10-08")).toBe(4); // jueves
  });
  it("usa formatos argentinos y el horario de Argentina", () => {
    expect(formatDate("2026-10-03")).toBe("03/10/2026");
    const d = arDateTime("2026-10-03", "18:40");
    expect(formatTime(d)).toBe("18:40");
    expect(todayAR(new Date("2026-10-04T02:00:00Z"))).toBe("2026-10-03");
  });
});
