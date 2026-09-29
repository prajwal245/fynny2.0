import { toast } from "sonner";

export type CsvRow = Record<string, string | number | boolean | null | undefined>;

export function exportToCsv(data: CsvRow[], filename: string) {
  if (!data || data.length === 0) {
    toast.error("No data to export");
    return;
  }
  const headers = Object.keys(data[0]!);
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const v = row[h];
          if (v === null || v === undefined) return "";
          const s = String(v);
          if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  toast.success("CSV exported successfully");
}
