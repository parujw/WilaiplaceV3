"use client";

export function PrintButton() {
  return (
    <div className="print-bar">
      <button type="button" onClick={() => window.print()}>
        พิมพ์ / บันทึกเป็น PDF
      </button>
    </div>
  );
}
