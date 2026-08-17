import { describe, expect, it } from "vitest";
import { CONVERGENT_PROTOCOL_CONFIG } from "@/lib/customers/convergent/protocol-config";
import { parseProtocol } from "./parse-protocol";
import { readProtocolFixture } from "./read-fixtures";
import { EXPECTED } from "./expected-findings";

const config = CONVERGENT_PROTOCOL_CONFIG;

const HELP_TOMBSTONE_SNIPPET = `
GENERAL REQUIREMENTS: SOLEA HELP
REQUIREMENTS
       Req ID                                                             General Requirements: Solea Help
 SW-HE-1                The software shall provide a link to a webpage where the user can access help information.
 SW-HE-5                [Removed in Rev X]

SW-HE-1
TESTING METHODS
  Req(s)                       Instruction                               Expected Result
 SW-HE-1     3. Scan the QR code with a mobile device
 SW-HE-5     camera.                                             compatible mobile device.
 General Requirements: Solea Help Section End
`;

const WVU_SNIPPET = `
AUDITING / TROUBLESHOOTING: VIEW UPLOAD USAGE INFORMATION
REQUIREMENTS
      Req ID                                                     Auditing / Troubleshooting: View Upload Usage Information
 SW-WVU-1               The software shall provide the ability for the Service Technician role to view laser usage information for the system. The information
                        displayed shall include the following:
 SW-WVU-1.1             The total time the laser has been activated as measured by the time spent in the states Laser User Warning, Laser Armed, and Laser
                        Cutting states.
 SW-WVU-1.2             The average time of laser activation, as measured by dividing the total activation time by the number of activations.
 SW-WVU-1.3             The activation information shall be stored in the Windows registry such that it is not removed/replaced during re-installation of the
                        Solea software.
 SW-WVU-2               The software shall provide the ability to capture the following hand piece usage information and upload this usage information to the
                        Convergent Installation Server.
 SW-WVU-2.1             The number of times a specific hand piece type is used on the system
 SW-WVU-2.2             The amount of time a specific hand piece type is used

SW-WVU-1.1, SW-WVU-1.2, SW-WVU-1.3, SW-WVU-2, SW-WVU-2.1, SW-WVU-2.2
TESTING METHODS
  Req(s)                        Instruction                                Expected Result
             1. Login as a Service Technician by touching 1-3-
 SW-         1-3. Touch the Service Tasks and then Run Time
                                                                   The total run time and average
 WVU-1       to display run time information dialog.
 SW-                                                                   dialog.
 WVU-1.1     2. Note the total and average run time.
 SW-
 WVU-1.2     3. Touch OK. Touch Home and select the Contra
 SW-             HKEY_CURRENT_USER/Software/SOLEA and                The Registry Editor is closed.
 WVU-1
 SW-
 WVU-1.3
             3. Close the Registry Editor.
 SW-                                                              The number of times a specific
 WVU-2                                                            handpiece has been used is
 SW-             4. -  The amount of time that a specific
 WVU-2.1                                                          The amount of time a specific
 SW-             seconds).
 WVU-2.2                                                          recorded in the Solea database.
 Auditing / Troubleshooting: View Upload Usage Information Section End
`;

describe("parseProtocol", () => {
  it("repairs wrapped Req(s) IDs so all seven SW-WVU-* count as tested", () => {
    const { blocks } = parseProtocol(WVU_SNIPPET, config);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.testedReqIds.sort()).toEqual([
      "SW-WVU-1",
      "SW-WVU-1.1",
      "SW-WVU-1.2",
      "SW-WVU-1.3",
      "SW-WVU-2",
      "SW-WVU-2.1",
      "SW-WVU-2.2",
    ]);
  });

  it("does not treat REQUIREMENTS tombstone rows as live claimed or tested IDs", () => {
    const { blocks } = parseProtocol(HELP_TOMBSTONE_SNIPPET, config);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.declaredReqIds).toEqual(["SW-HE-1"]);
    expect(blocks[0]?.testedReqIds).toEqual(["SW-HE-1"]);
    expect(blocks[0]?.bannerReqIds).toEqual(["SW-HE-1"]);
  });

  it("parses the protocol fixture: 47 blocks, WLP not dropped, Table 2 has no Ophir", () => {
    const parsed = parseProtocol(readProtocolFixture(), config);
    expect(parsed.blocks).toHaveLength(EXPECTED.blockCount);

    const wlp = parsed.blocks.find((b) => /initiation of laser cutting/i.test(b.title));
    expect(wlp).toBeDefined();
    expect(wlp!.declaredReqIds.length).toBeGreaterThan(40);

    const wvu = parsed.blocks.find((b) => /view upload usage/i.test(b.title));
    expect(wvu?.testedReqIds).toEqual(
      expect.arrayContaining([
        "SW-WVU-1",
        "SW-WVU-1.1",
        "SW-WVU-1.2",
        "SW-WVU-1.3",
        "SW-WVU-2",
        "SW-WVU-2.1",
        "SW-WVU-2.2",
      ])
    );

    expect(parsed.equipmentTable.map((n) => n.toLowerCase())).toEqual(
      expect.arrayContaining([
        "timer",
        "manometer",
        "top loading balance",
        "oscilloscope",
        "logic analyzer",
      ])
    );
    expect(parsed.equipmentTable.join(" ").toLowerCase()).not.toMatch(/ophir/);
    expect(parsed.referencesTable).toEqual(
      expect.arrayContaining(["822-00007", "790-00155", "721-00120"])
    );

    const alignment = parsed.blocks.find((b) => /alignment state/i.test(b.title));
    expect(alignment?.bannerReqIds).toContain("SW-AS-3.1");
    expect(alignment?.instrumentsNamed).toContain("ophir");
  });
});
