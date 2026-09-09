---
name: Report export format contract
description: Report exports must preserve tender reconciliation fields across every supported file format.
---

PDF report rows must not be truncated before serialization. Cash received and change due are appended export columns, so truncating long header or data lines can silently remove them even when the API row is correct.

**Why:** A format-specific regression exposed that the PDF writer could omit trailing cash fields while CSV and XLSX remained correct.

**How to apply:** When adding or reordering report columns, exercise every supported export format and verify both values and the serialized column order.