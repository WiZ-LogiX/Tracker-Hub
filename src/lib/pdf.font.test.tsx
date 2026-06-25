import { describe, it, expect } from "vitest";
import { renderToBuffer, Document, Page, Text, Font } from "@react-pdf/renderer";
import {
  CAIRO_REGULAR_B64,
  CAIRO_SEMIBOLD_B64,
  CAIRO_BOLD_B64,
} from "@/lib/fonts/cairo.b64";

Font.register({
  family: "Cairo",
  fonts: [
    { src: `data:font/ttf;base64,${CAIRO_REGULAR_B64}`, fontWeight: 400 },
    { src: `data:font/ttf;base64,${CAIRO_SEMIBOLD_B64}`, fontWeight: 600 },
    { src: `data:font/ttf;base64,${CAIRO_BOLD_B64}`, fontWeight: 700 },
  ],
});

describe("pdf font registration", () => {
  it("renders an Arabic-only PDF without throwing fetch errors", async () => {
    const buf = await renderToBuffer(
      <Document>
        <Page size="A4">
          <Text style={{ fontFamily: "Cairo", fontSize: 14 }}>
            تجربة عربية — فاتورة بدون أخطاء
          </Text>
        </Page>
      </Document>,
    );
    expect(buf.length).toBeGreaterThan(1024);
    expect(buf.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });
});
