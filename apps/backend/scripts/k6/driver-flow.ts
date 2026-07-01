import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "60s", target: 100 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<1000"],
    http_req_failed: ["rate<0.1"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  const phone = `+549261${Math.floor(1000000 + Math.random() * 9000000)}`;
  const password = "testPass123";

  const otpRes = http.post(`${BASE}/api/auth/register/phone`, JSON.stringify({ phone }), {
    headers: { "Content-Type": "application/json" },
  });
  if (otpRes.status !== 200) return;

  const otp = JSON.parse(otpRes.body as string).otp;
  if (!otp) return;

  const regRes = http.post(
    `${BASE}/api/auth/register/verify`,
    JSON.stringify({ phone, otp, password, full_name: "Load Driver" }),
    { headers: { "Content-Type": "application/json" } },
  );
  if (regRes.status !== 200) return;

  const token = JSON.parse(regRes.body as string).access_token;
  if (!token) return;

  const driverRes = http.post(
    `${BASE}/api/onboarding/step1`,
    JSON.stringify({
      first_name: "Load",
      last_name: "Test",
      birth_date: "1990-01-01",
      gender: "male",
      phone,
    }),
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
  );
  check(driverRes, { "step1 ok": (r) => r.status === 200 });

  const mapsRes = http.get(`${BASE}/api/maps/places/autocomplete?input=Av`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(mapsRes, { "autocomplete ok": (r) => r.status === 200 });

  const statsRes = http.get(`${BASE}/api/driver-stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(statsRes, { "stats ok": (r) => r.status === 200 });

  const earningsRes = http.get(`${BASE}/api/earnings/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(earningsRes, { "earnings ok": (r) => r.status === 200 });

  sleep(2);
}
