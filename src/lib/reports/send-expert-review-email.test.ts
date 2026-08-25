import { afterEach, describe, expect, it, vi } from "vitest";
import { HIDDEN_EXPERT_REVIEWER_EMAIL } from "@/lib/reports/hidden-expert-reviewer";
import { sendExpertReviewEmail } from "@/lib/reports/send-expert-review-email";

describe("sendExpertReviewEmail", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
    vi.restoreAllMocks();
  });

  it("emails Aditya and the requester with an escaped note and edit link", async () => {
    process.env = {
      ...env,
      AUTH_RESEND_KEY: "re_test",
      AUTH_URL: "https://convergent.andreihealth.com",
      AUTH_EMAIL_FROM: "noreply@andreihealth.com",
    };
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_URL;

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await sendExpertReviewEmail({
      reportId: "report-1",
      documentNo: "DV-100",
      requesterName: "Sam Engineer",
      requesterEmail: "sam@convergentdental.com",
      note: "Please look at <script>alert(1)</script> the results table.",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string
    ) as { to: string[]; html: string; subject: string };
    expect(body.to).toEqual([
      HIDDEN_EXPERT_REVIEWER_EMAIL,
      "sam@convergentdental.com",
    ]);
    expect(body.subject).toContain("DV-100");
    expect(body.html).toContain(
      "https://convergent.andreihealth.com/reports/report-1/edit"
    );
    expect(body.html).toContain("&lt;script&gt;");
    expect(body.html).not.toContain("<script>alert(1)</script>");
  });
});
