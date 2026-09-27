import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { validateUpload } from "@/lib/uploadPolicy";
import { useCAAuth } from "@/contexts/CAAuthContext";
import { toast } from "sonner";

export interface CADocument {
  id: string;
  original_filename: string;
  stored_filename: string;
  storage_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  document_type: string;
  filing_period: string | null;
  description: string | null;
  client_reference_code: string;
  created_at: string;
  uploaded_by: string;
}

export interface UploadOptions {
  business_id: string;
  client_reference_code: string;
  document_type?: string;
  filing_period?: string;
  description?: string;
}

export function useCADocuments(business_id?: string | null) {
  const { caFirm } = useCAAuth();
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<CADocument[]>([]);
  const [loading, setLoading] = useState(false);

  const buildStoragePath = (
    ca_firm_id: string,
    biz_id: string,
    filename: string
  ): string => {
    const timestamp = Date.now();
    const sanitized = filename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_{2,}/g, "_")
      .toLowerCase();
    const uniqueName = `${timestamp}_${sanitized}`;
    return `${ca_firm_id}/${biz_id}/${uniqueName}`;
  };

  const uploadDocument = async (
    file: File,
    options: UploadOptions
  ): Promise<{ success: boolean; document?: CADocument; error?: string }> => {
    if (!caFirm?.id) return { success: false, error: "CA firm not found" };
    const policyError = validateUpload("ca-client-documents", file);
    if (policyError) return { success: false, error: policyError };


    setUploading(true);
    try {
      const storagePath = buildStoragePath(caFirm.id, options.business_id, file.name);

      const { error: uploadError } = await supabase.storage
        .from("ca-client-documents")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        return { success: false, error: uploadError.message };
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: "Not authenticated" };

      const { data: docRecord, error: dbError } = await supabase
        .from("ca_client_documents")
        .insert({
          ca_firm_id: caFirm.id,
          business_id: options.business_id,
          client_reference_code: options.client_reference_code,
          original_filename: file.name,
          stored_filename: storagePath.split("/").pop() ?? file.name,
          storage_path: storagePath,
          file_size_bytes: file.size,
          mime_type: file.type,
          document_type: options.document_type ?? "general",
          filing_period: options.filing_period ?? null,
          description: options.description ?? null,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (dbError) {
        await supabase.storage.from("ca-client-documents").remove([storagePath]);
        return { success: false, error: dbError.message };
      }

      setDocuments((prev) => [docRecord as CADocument, ...prev]);
      return { success: true, document: docRecord as CADocument };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Upload failed" };
    } finally {
      setUploading(false);
    }
  };

  const loadDocuments = async () => {
    if (!caFirm?.id || !business_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ca_client_documents")
      .select("id, original_filename, stored_filename, storage_path, file_size_bytes, mime_type, document_type, filing_period, description, client_reference_code, created_at, uploaded_by")
      .eq("ca_firm_id", caFirm.id)
      .eq("business_id", business_id)
      .order("created_at", { ascending: false });

    setLoading(false);
    if (!error) setDocuments((data ?? []) as CADocument[]);
  };

  const getDownloadUrl = async (storagePath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from("ca-client-documents")
      .createSignedUrl(storagePath, 3600);
    if (error || !data) return null;
    return data.signedUrl;
  };

  const deleteDocument = async (documentId: string, storagePath: string): Promise<boolean> => {
    if (!caFirm?.id) return false;
    const { error: storageErr } = await supabase.storage
      .from("ca-client-documents")
      .remove([storagePath]);
    if (storageErr) { toast.error("Failed to delete file from storage"); return false; }

    const { error: dbErr } = await supabase
      .from("ca_client_documents")
      .delete()
      .eq("id", documentId)
      .eq("ca_firm_id", caFirm.id);

    if (dbErr) { toast.error("Failed to delete document record"); return false; }
    setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    return true;
  };

  const lookupByReferenceCode = async (refCode: string) => {
    if (!caFirm?.id) return null;
    const { data, error } = await supabase.rpc("lookup_client_by_reference", {
      p_reference_code: refCode.toUpperCase().trim(),
      p_ca_firm_id: caFirm.id,
    });
    if (error || !data?.length) return null;
    return data[0];
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return {
    documents,
    uploading,
    loading,
    uploadDocument,
    loadDocuments,
    getDownloadUrl,
    deleteDocument,
    lookupByReferenceCode,
    formatFileSize,
  };
}
