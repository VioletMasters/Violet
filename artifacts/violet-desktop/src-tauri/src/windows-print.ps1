# Windows PowerShell 5.1 / System.Drawing uses the installed Windows printer driver.
# This submits directly to the named printer instead of asking Notepad to handle
# a temporary .txt file. A successful return confirms spooler submission, not paper output.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$printerName = [Environment]::GetEnvironmentVariable('VIOLET_PRINTER_NAME', 'Process')
$filePath = [Environment]::GetEnvironmentVariable('VIOLET_PRINT_PATH', 'Process')
if ([string]::IsNullOrWhiteSpace($printerName) -or [string]::IsNullOrWhiteSpace($filePath)) {
    throw 'Violet did not provide a printer name and receipt file.'
}
if (-not [System.IO.File]::Exists($filePath)) {
    throw "The receipt file is not available: $filePath"
}

$document = [System.Drawing.Printing.PrintDocument]::new()
$script:violetFont = $null
try {
    $document.PrinterSettings.PrinterName = $printerName
    if (-not $document.PrinterSettings.IsValid) {
        throw "Windows cannot find printer '$printerName'. Choose a detected Windows printer in Violet Settings > Printers."
    }
    $document.DocumentName = 'Violet receipt'
    $document.PrintController = [System.Drawing.Printing.StandardPrintController]::new()
    $document.DefaultPageSettings.Margins = [System.Drawing.Printing.Margins]::new(0, 0, 0, 0)
    $script:violetFont = [System.Drawing.Font]::new('Courier New', [single]8, [System.Drawing.FontStyle]::Regular)
    $script:violetLines = [System.IO.File]::ReadAllLines($filePath, [System.Text.Encoding]::UTF8)
    $script:violetLineIndex = 0

    $handler = [System.Drawing.Printing.PrintPageEventHandler] {
        param($sender, $eventArgs)
        $lineHeight = [Math]::Max(12.0, $eventArgs.Graphics.MeasureString('Mg', $script:violetFont).Height)
        $y = 2.0
        while ($script:violetLineIndex -lt $script:violetLines.Length) {
            if ($y -gt 2.0 -and ($y + $lineHeight) -gt ($eventArgs.MarginBounds.Height - 2.0)) {
                break
            }
            $eventArgs.Graphics.DrawString(
                $script:violetLines[$script:violetLineIndex],
                $script:violetFont,
                [System.Drawing.Brushes]::Black,
                [single]3.0,
                [single]$y
            )
            $script:violetLineIndex++
            $y += $lineHeight
        }
        $eventArgs.HasMorePages = $script:violetLineIndex -lt $script:violetLines.Length
    }
    $document.add_PrintPage($handler)
    $document.Print()
    Write-Output "Submitted to Windows print spooler: $printerName"
}
finally {
    if ($script:violetFont) { $script:violetFont.Dispose() }
    $document.Dispose()
}