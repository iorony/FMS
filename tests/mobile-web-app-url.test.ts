import { describe, expect, it } from "vitest";
import { apiUrl } from "../mobile/lib/web-app-url";

describe("URL de integración móvil", () => {
  it("compone rutas sin barras duplicadas", () => {
    expect(apiUrl("https://fms.example.com/", "/api/admin/users"))
      .toBe("https://fms.example.com/api/admin/users");
  });

  it("rechaza configuraciones sin URL HTTP válida", () => {
    expect(apiUrl(undefined, "/api/admin/users")).toBeNull();
    expect(apiUrl("fms.example.com", "/api/admin/users")).toBeNull();
  });
});
