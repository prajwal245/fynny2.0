import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GeneratedReport = {
  id: string;
  business_id: string;
  report_type: string;
  report_name: string;
  generated_by: string | null;
  generated_at: string;
  file_url: string | null;
  file_size: number | null;
  status: string;
  parameters: Record<string, unknown>;
};

export function useGeneratedReports(businessId: string | null) {
  return useQuery({
    queryKey: ["reports", "generated", businessId],
    queryFn: async (): Promise<GeneratedReport[]> => {
      if (!businessId) return [];
      const { data, error } = await (supabase as any)
        .from("generated_reports")
        .select("*")
        .eq("business_id", businessId)
        .order("generated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as GeneratedReport[]) || [];
    },
    staleTime: 30_000,
    enabled: !!businessId,
  });
}

export function useGenerateReport(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      report_type: string;
      report_name: string;
      generated_by: string;
      parameters?: Record<string, unknown>;
    }) => {
      if (!businessId) throw new Error("No business selected");

      // 1. Insert the generating row
      const { data: newRow, error: insertError } = await (supabase as any)
        .from("generated_reports")
        .insert({
          business_id: businessId,
          report_type: args.report_type,
          report_name: args.report_name,
          generated_by: args.generated_by,
          status: "generating",
          parameters: args.parameters ?? {},
        })
        .select()
        .single();
      if (insertError) throw insertError;

      const markFailed = async () => {
        await (supabase as any)
          .from("generated_reports")
          .update({ status: "failed" })
          .eq("id", newRow.id);
      };

      // 2. Call the real generator
      const { data: result, error: fnError } = await supabase.functions.invoke("generate-report", {
        body: {
          report_type: args.report_type,
          business_id: businessId,
          format: (args.parameters as any)?.format ?? "pdf",
          parameters: args.parameters ?? {},
          report_row_id: newRow.id,
        },
      });
      if (fnError) {
        await markFailed();
        throw fnError;
      }
      if (!result?.success) {
        await markFailed();
        throw new Error(result?.error ?? "Report generation failed");
      }

      // 3. Persist the file location
      await (supabase as any)
        .from("generated_reports")
        .update({
          status: "completed",
          file_url: result.file_url,
          file_size: result.file_size,
        })
        .eq("id", newRow.id);

      return { ...(newRow as GeneratedReport), status: "completed", file_url: result.file_url };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports", "generated", businessId] });
    },
  });
}

