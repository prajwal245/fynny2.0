import { TallyPosting } from "./TallyPosting";
import { useBooksFor } from "./BooksExport";
import { V } from "../ui";

/**
 * The approve-and-write panel of a bank statement, for the books system the client really keeps. A Zoho client is not offered
 * "Post to Tally" (and told to update a Tally connector); a client linked to both systems is told so, because books read from
 * two systems at once are matched twice.
 */
export function BooksPanel({
  clientId,
  documentId,
}: {
  clientId: string;
  documentId: string;
}) {
  const books = useBooksFor(clientId);
  if (books.length === 1 && books[0] === "zoho") {
    return (
      <div
        data-testid="zoho-books-note"
        style={{
          border: `1px solid ${V.line}`,
          borderRadius: 12,
          padding: 12,
          fontSize: 13,
          display: "grid",
          gap: 4,
        }}
      >
        <b>Books: Zoho Books</b>
        <span>
          This client keeps its books in Zoho Books, so entries are not written
          to Tally. Entries missing from Zoho are handled in Exceptions: open a
          line and use Post to Zoho (when it is switched on for your firm), or
          export the missing entries as a CSV and import them into Zoho.
        </span>
      </div>
    );
  }
  return (
    <>
      {books.length > 1 && (
        <div
          role="alert"
          data-testid="two-books-warning"
          style={{
            border: "1px solid rgba(169,56,56,.45)",
            borderRadius: 12,
            padding: 12,
            fontSize: 13,
            display: "grid",
            gap: 4,
            marginBottom: 10,
          }}
        >
          <b style={{ color: "#a93838" }}>
            This client is linked to both Tally and Zoho Books.
          </b>
          <span>
            Books from two systems are matched together, so the same entry can
            appear twice and bank lines can look unmatched. Keep one system per
            client, or unlink the other, before relying on this reconciliation.
          </span>
        </div>
      )}
      <TallyPosting clientId={clientId} documentId={documentId} />
    </>
  );
}
