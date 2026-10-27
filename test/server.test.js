const test = require("node:test");
const assert = require("node:assert/strict");
const { app, swaggerSpec } = require("../server");

test("server registers documented routes for implemented backend modules", () => {
  assert.deepEqual(Object.keys(swaggerSpec.paths).sort(), [
    "/",
    "/api/announcements",
    "/api/announcements/{id}",
    "/api/attendance",
    "/api/attendance/{id}",
    "/api/auth/login",
    "/api/auth/register",
    "/api/employees",
    "/api/employees/{id}",
    "/api/leaves",
    "/api/leaves/{id}",
    "/api/leaves/{id}/status",
    "/api/trainings",
    "/api/trainings/{id}",
  ]);
  assert.deepEqual(Object.keys(swaggerSpec.paths["/api/employees/{id}"]).sort(), ["delete", "get", "patch"]);
  assert.ok(swaggerSpec.paths["/api/attendance"].get.responses["409"]);
  assert.equal(swaggerSpec.paths["/api/attendance"].get.responses["200"].content["application/json"].schema.properties.missingAttendance.type, "array");
  assert.ok(app._router || app.router, "Express application is constructed");
});

test("HTTP server exposes health, Swagger, module authorization, and request errors without MongoDB", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).success, true);
    const docs = await fetch(`${base}/api-docs/`);
    assert.equal(docs.status, 200);
    assert.match(await docs.text(), /swagger-ui/);
    const invalidRegistration = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(invalidRegistration.status, 400);
    const unauthenticatedEmployees = await fetch(`${base}/api/employees`);
    assert.equal(unauthenticatedEmployees.status, 401);
    for (const path of ["/api/leaves", "/api/announcements", "/api/trainings"]) {
      assert.equal((await fetch(`${base}${path}`)).status, 401);
    }
    const malformedJson = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformedJson.status, 400);
    const missing = await fetch(`${base}/not-a-route`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).message, "Route not found");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
