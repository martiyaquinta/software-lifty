import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "30s", target: 50 },
    { duration: "30s", target: 100 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.05"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  const phone = `+549261${Math.floor(1000000 + Math.random() * 9000000)}`;
  const password = "testPass123";

  const otpRes = http.post(`${BASE}/api/auth/register/phone`, JSON.stringify({ phone }), {
    headers: { "Content-Type": "application/json" },
  });
  check(otpRes, { "otp sent": (r) => r.status === 200 });

  if (otpRes.status !== 200) return;
  const otp = JSON.parse(otpRes.body as string).otp;
  if (!otp) return;

  const regRes = http.post(
    `${BASE}/api/auth/register/verify`,
    JSON.stringify({ phone, otp, password, full_name: "Load Test" }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(regRes, { "register ok": (r) => r.status === 200 });

  if (regRes.status !== 200) return;
  const token = JSON.parse(regRes.body as string).access_token;
  if (!token) return;

  const meRes = http.get(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(meRes, { "me ok": (r) => r.status === 200 });

  sleep(1);
}
