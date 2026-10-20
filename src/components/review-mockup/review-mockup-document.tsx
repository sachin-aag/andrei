"use client";

import { useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { findingById, type FindingSeverity } from "@/lib/review-mockup/sample-data";
import { useReviewMockup } from "./review-mockup-state";

function Hit({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { selectedFindingId, visibleFindings, registerAnchor } = useReviewMockup();
  const setRef = useCallback(
    (node: HTMLElement | null) => registerAnchor(id, node),
    [id, registerAnchor]
  );
  const selected = findingById(selectedFindingId ?? "")?.anchorId === id;
  const matching = visibleFindings.filter((finding) => finding.anchorId === id);
  const severity: FindingSeverity | null = selected
    ? (findingById(selectedFindingId ?? "")?.severity ?? null)
    : matching[0]?.severity ?? null;
  const marked = selected || matching.length > 0;

  return (
    <mark
      ref={setRef}
      id={id}
      data-review-anchor={id}
      data-active={selected ? "true" : "false"}
      className={cn(
        "rounded-[2px] scroll-mt-8",
        marked && severity === "critical" && "bg-red-600/10 box-decoration-clone shadow-[inset_0_-2px_0_rgb(220,38,38)]",
        marked && severity === "major" && "bg-amber-500/15 box-decoration-clone shadow-[inset_0_-2px_0_rgb(217,119,6)]",
        marked && severity === "minor" && "bg-sky-500/10 box-decoration-clone shadow-[inset_0_-2px_0_rgb(14,116,144)]",
        selected && "outline outline-2 outline-offset-2 outline-[var(--ring)]"
      )}
    >
      {children}
    </mark>
  );
}

function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={cn("border border-[var(--border)] px-2.5 py-1.5 align-top", className)}>
      {children}
    </td>
  );
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border border-[var(--border)] bg-[var(--secondary)] px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]",
        className
      )}
    >
      {children}
    </th>
  );
}

export function ReviewMockupDocument() {
  const { tm02Applied } = useReviewMockup();

  return (
    <article
      className="generic-paged-document mx-auto text-[12pt] leading-[1.5] text-[var(--foreground)]"
      data-testid="review-mockup-document"
    >
      <div className="generic-page-sheet px-[0.9in] py-[0.9in]">
        <table className="mb-6 w-full border-collapse text-[11px]">
          <tbody>
            <tr>
              <Th>Company</Th>
              <Th>Document no.</Th>
              <Th>Revision</Th>
              <Th>Status</Th>
            </tr>
            <tr>
              <Cell className="font-medium">Kestrel Medical</Cell>
              <Cell className="font-medium">DVP-0142</Cell>
              <Cell className="font-medium">B</Cell>
              <Cell>Draft for review</Cell>
            </tr>
          </tbody>
        </table>

        <h1 className="mb-1 text-[18pt] font-bold tracking-tight">
          Design Verification Protocol: AX-7 Irrigated RF Ablation Catheter
        </h1>
        <p className="mb-6 text-[11pt] text-[var(--muted-foreground)]">
          Tip temperature, contact force, irrigation and tip-joint integrity · Build
          configuration BC-3
        </p>

        <h2 className="mb-2 mt-6 text-[14pt] font-semibold">1 Purpose</h2>
        <p className="mb-4">
          This protocol defines the design verification testing for the AX-7 Irrigated
          RF Ablation Catheter to demonstrate that design outputs meet design inputs as
          required by{" "}
          <Hit id="purpose">21 CFR 820.30(f)</Hit>.
        </p>

        <h2 className="mb-2 mt-6 text-[14pt] font-semibold">2 Scope</h2>
        <p className="mb-4">
          This protocol applies to AX-7 catheters from build configuration BC-3,
          manufactured on <Hit id="scope">pilot line PL-2</Hit>. It covers tip
          temperature sensing, contact force sensing, saline irrigation and tip-joint
          integrity. The nominal irrigation flow during ablation is 15 mL/min.
        </p>

        <h2 className="mb-2 mt-6 text-[14pt] font-semibold">3 References</h2>
        <ul className="mb-4 list-disc space-y-1 pl-6">
          <li>DIS-0088 Design Input Specification, Rev D</li>
          <li>
            <Hit id="ref-rmf">RMF-0019 Risk Management File, Rev C</Hit>
          </li>
          <li>SOP-QA-0021 Test Execution and Documentation, Rev C</li>
          <li>
            <Hit id="ref-iso-14971">
              ISO 14971:2007 Medical devices: Application of risk management to medical
              devices
            </Hit>
          </li>
          <li>
            <Hit id="ref-iec">
              IEC 60601-2-2:2017 Particular requirements for high frequency surgical
              equipment
            </Hit>
          </li>
          <li>
            <Hit id="ref-iso-10555">
              ISO 10555-1 Intravascular catheters: General requirements
            </Hit>
          </li>
        </ul>

        <h2 className="mb-2 mt-6 text-[14pt] font-semibold">4 Definitions</h2>
        <p className="mb-1" id="definitions">
          <span className="font-semibold">DUT:</span> Device under test.
        </p>
        <p className="mb-4">
          <span className="font-semibold">NCR:</span> Nonconformance report.
        </p>

        <h2 className="mb-2 mt-6 text-[14pt] font-semibold">5 Responsibilities</h2>
        <p className="mb-4">
          The R&amp;D Engineer executes the protocol and records results. Quality
          reviews the completed record before DHF filing.
        </p>

        <h2 className="mb-2 mt-6 text-[14pt] font-semibold">6 Sample size</h2>
        <p className="mb-4">
          <Hit id="sample-size">
            6.2 Sample size rationale. n = 30 units from build BC-3 will be tested.
            This sample size is consistent with prior AX-family protocols.
          </Hit>
        </p>

        <h2 className="mb-2 mt-6 text-[14pt] font-semibold">7 Test methods</h2>
        <table className="mb-4 w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <Th>TM</Th>
              <Th>Input</Th>
              <Th>Method</Th>
              <Th>Acceptance criterion</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Cell>
                <Hit id="tm-01">TM-01</Hit>
              </Cell>
              <Cell>DI-031</Cell>
              <Cell>Tip temperature accuracy, saline bath</Cell>
              <Cell>±2 °C vs reference TC</Cell>
            </tr>
            <tr>
              <Cell>TM-02</Cell>
              <Cell>DI-034</Cell>
              <Cell>Contact force accuracy, 0–60 g applied load</Cell>
              <Cell>
                {tm02Applied ? (
                  <>
                    <span className="suggestion-delete">
                      Force readings shall be acceptable to the R&amp;D Engineer
                    </span>{" "}
                    <span className="suggestion-insert">
                      Measured force within ±5 g (0–20 g) and ±10% (20–60 g) of the
                      applied reference load
                    </span>
                  </>
                ) : (
                  <Hit id="tm-02-criterion">
                    Force readings shall be acceptable to the R&amp;D Engineer
                  </Hit>
                )}
              </Cell>
            </tr>
            <tr>
              <Cell>TM-03</Cell>
              <Cell>DI-036</Cell>
              <Cell>Irrigation flow rate at 15 mL/min set point</Cell>
              <Cell>
                <Hit id="tm-03-criterion">13–17 mL/min</Hit>
              </Cell>
            </tr>
            <tr>
              <Cell>
                <Hit id="tm-04">TM-04</Hit>
              </Cell>
              <Cell>DI-040</Cell>
              <Cell>Tip-joint tensile strength per ISO 10555-1</Cell>
              <Cell>≥ 15 N, no separation</Cell>
            </tr>
          </tbody>
        </table>

        <p className="mb-4">
          <Hit id="coverage-statement">
            Test coverage: this protocol verifies all design inputs allocated to the
            tip assembly in DIS-0088.
          </Hit>{" "}
          Pre-conditioning deviations are handled per Section 7.3.
        </p>

        <h2 className="mb-2 mt-6 text-[14pt] font-semibold">9 Data Recording</h2>
        <p className="mb-3">
          9.1{" "}
          <Hit id="data-recording">
            The R&amp;D Engineer should record results on datasheet DS-0142. Results
            may be recorded in pencil and transcribed to the datasheet at end of
            shift.
          </Hit>
        </p>
        <p className="mb-6">
          9.2 Any failure shall be documented on an NCR and assessed for impact on the
          design.
        </p>

        <h2 className="mb-2 text-[14pt] font-semibold">Approvals</h2>
        <table className="mb-6 w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <Th>Role</Th>
              <Th>Name</Th>
              <Th>Date</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Cell>Author, R&amp;D</Cell>
              <Cell>R. Iyer</Cell>
              <Cell>12-Sep-2026</Cell>
            </tr>
            <tr>
              <Cell>Quality</Cell>
              <Cell>
                <Hit id="approvals">[INSERT NAME]</Hit>
              </Cell>
              <Cell>XX-XX-2026</Cell>
            </tr>
          </tbody>
        </table>

        <h2 className="mb-2 text-[14pt] font-semibold">Revision History</h2>
        <p>
          Rev A: Initial release. Rev B: <Hit id="revision-history">[INSERT]</Hit>
        </p>
      </div>
    </article>
  );
}
