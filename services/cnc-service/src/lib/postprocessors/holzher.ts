/**
 * Post-processor for HOLZHER dynestic 7507 CNC router.
 * Generates WoodWOP-compatible G-code for panel drilling and routing operations.
 */

interface Part {
  name: string;
  width: number;
  height: number;
  thickness: number;
  quantity: number;
  cutParams?: Record<string, unknown>;
}

interface GcodeInput {
  jobId: string;
  config: Record<string, unknown>;
  parts: Part[];
}

function header(jobId: string): string {
  return [
    `; WoodCraft OS — HOLZHER dynestic 7507`,
    `; Job: ${jobId}`,
    `; Generated: ${new Date().toISOString()}`,
    `%`,
    `G21 ; Millimeter mode`,
    `G90 ; Absolute positioning`,
    `G17 ; XY plane selection`,
    `M6 T1 ; Select tool 1 (router bit)`,
    `G0 Z10 ; Safe height`,
    ``,
  ].join("\n");
}

function footer(): string {
  return [
    ``,
    `G0 Z50 ; Park Z`,
    `G0 X0 Y0 ; Return to home`,
    `M5 ; Spindle off`,
    `M30 ; End program`,
    `%`,
  ].join("\n");
}

function routePart(part: Part, index: number): string {
  const feedRate = 6000;
  const plungeRate = 1000;
  const spindleSpeed = 18000;
  const cutDepth = part.thickness + 2; // 2mm through-cut allowance
  const xOffset = (index % 5) * (part.width + 50); // Nest parts in rows of 5
  const yOffset = Math.floor(index / 5) * (part.height + 50);

  return [
    ``,
    `; Part ${index + 1}: ${part.name} (${part.width}x${part.height}x${part.thickness}mm) qty=${part.quantity}`,
    `S${spindleSpeed} M3 ; Spindle on`,
    `G0 X${xOffset} Y${yOffset} ; Move to part origin`,
    `G0 Z2 ; Approach height`,
    `G1 Z-${cutDepth} F${plungeRate} ; Plunge`,
    `G1 X${xOffset + part.width} F${feedRate} ; Cut X+`,
    `G1 Y${yOffset + part.height} ; Cut Y+`,
    `G1 X${xOffset} ; Cut X-`,
    `G1 Y${yOffset} ; Cut Y- (close)`,
    `G0 Z10 ; Retract`,
  ].join("\n");
}

export function generateHolzherGcode(input: GcodeInput): string {
  const sections = [header(input.jobId)];
  input.parts.forEach((part, i) => {
    sections.push(routePart(part, i));
  });
  sections.push(footer());
  return sections.join("\n");
}
