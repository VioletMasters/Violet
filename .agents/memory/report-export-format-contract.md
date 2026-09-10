---
name: Report export format contract
description: Report exports must preserve tender reconciliation fields across every supported file format.
---

PDF report rows must not be truncated before serialization. Cash received and change due are appended export columns, so truncating long header or data lines can silently remove them even when the API row is correct.

**Why:** A format-specific regression exposed that the PDF writer could omit trailing cash fields while CSV and XLSX remained correct.

**How to apply:** When adding or reordering report columns, exercise every supported export format and verify both values and the serialized column order.

PDF fixture parsers must group wrapped fragments by the receipt-number marker, not by arbitrary UUID fields, because store, register, and cashier identifiers can begin continuation fragments.

**Why:** Wrapped PDF rows contain several UUID-valued columns; treating every UUID fragment as a new row causes later reconciliation and item fields to appear missing in tests.

**How to apply:** Reassemble each logical row before checking status, tender, or item fields, and keep CSV/XLSX assertions as independent format checks.