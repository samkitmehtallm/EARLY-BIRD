import "server-only";
import nodemailer from "nodemailer";
import { env, has } from "../env";
import { accessToken, isGoogleConnected } from "../google/oauth";
import { fetchWithTimeout } from "../sources/http";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);

/** RFC 2822 multipart/alternative message, base64url-encoded for the Gmail API. */
export function buildRawMessage(m: OutgoingEmail, from: string): string {
  const boundary = `eb_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `From: Early Bird <${from}>`,
    `To: ${m.to}`,
    `Subject: ${encodeHeader(m.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(m.text, "utf8").toString("base64"),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(m.html, "utf8").toString("base64"),
    `--${boundary}--`,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export type Channel = "gmail" | "smtp";

/** Gmail API when Google is connected; Gmail SMTP app password as a fallback. */
export async function sendEmail(m: OutgoingEmail, fromEmail: string | null): Promise<{ channel: Channel; id: string }> {
  if (await isGoogleConnected()) {
    const token = await accessToken();
    const res = await fetchWithTimeout("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: buildRawMessage(m, fromEmail ?? m.to) }),
    });
    const j = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok || !j.id) throw new Error(`Gmail: ${j.error?.message ?? res.status}`);
    return { channel: "gmail", id: j.id };
  }
  if (has.smtp()) {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: env.gmailSmtpUser, pass: env.gmailAppPassword },
    });
    const info = await transport.sendMail({ from: `Early Bird <${env.gmailSmtpUser}>`, to: m.to, subject: m.subject, html: m.html, text: m.text });
    return { channel: "smtp", id: info.messageId };
  }
  throw Object.assign(new Error("No email channel connected"), { noChannel: true });
}
