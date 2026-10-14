-- Setup guides: Zoho Books, Tally on the firm's own computers, and Tally on
-- Cloud / remote desktop. Screens are FynHelp's own (test firm, sample data);
-- Tally steps are diagrams, not screenshots. Re-running updates in place.
insert into public.blog_posts
  (title, slug, excerpt, content, category, tags, status, published_at,
   author_name, author_role, reading_time_minutes, seo_title, seo_description, is_featured)
values
('How to connect Zoho Books to FynHelp (read-only)', 'connect-zoho-books-to-fynhelp',
 'A partner connects the firm''s Zoho login once, links each client to its Zoho bank account, and pulls a month''s bank ledger in as the books side for reconciliation. FynHelp only reads.',
 $z$<p class="answer"><strong>Short answer</strong>In FynHelp, open Settings → Integrations → Zoho Books and click Connect (partners only). Sign in to Zoho and allow read access. Back in FynHelp, link each client to its Zoho organisation and bank account, choose a month and click Pull month. The account's ledger arrives as that client's books side and Recon matches it against the bank statement. FynHelp never changes anything in Zoho.</p>

<p>If your clients keep their books in Zoho Books, you do not need to export anything. This guide covers what you need before you start, the four steps, and what FynHelp reads.</p>

<figure class="diagram"><img src="/blog/integrations/zoho-flow.svg" alt="Diagram: Zoho Books bank account ledger flows read-only into FynHelp as the books side, is reconciled against the bank statement, and feeds the MIS" loading="lazy" width="1200" height="420" /><figcaption>On a phone, swipe the diagram sideways. The Zoho ledger becomes the books side; the bank statement still comes from the client.</figcaption></figure>

<h2>Before you start</h2>
<ul>
<li><strong>A partner does the setup.</strong> Connecting, linking and disconnecting are partner actions. Anyone on the team can pull a month once a client is linked.</li>
<li><strong>Your Zoho login must see the client's organisation.</strong> The client adds your login as a user of their Zoho Books organisation (in Zoho Books: Settings → Users &amp; Roles → Invite User) with a role that can see banking. One login can see many clients' organisations.</li>
<li><strong>The client is already in FynHelp.</strong> Add the client on the Clients page first.</li>
</ul>

<h2>Step 1: Connect Zoho Books</h2>
<p>Go to <strong>Settings → Integrations</strong> and find Zoho Books. Click <strong>Connect Zoho Books</strong>. Zoho asks you to sign in and shows what FynHelp is asking for: read access to settings (to list organisations), banking (bank accounts) and accountant data (the account ledger). Click Accept.</p>
<figure><img src="/blog/integrations/zoho-1-connect.jpg" alt="FynHelp Settings, Zoho Books card with a Connect Zoho Books button" loading="lazy" /><figcaption>The Zoho Books card in Settings, before connecting.</figcaption></figure>

<h2>Step 2: Link a client to its Zoho bank account</h2>
<p>Back in FynHelp the card shows Connected. Click <strong>Link a client to a Zoho bank account</strong>, then choose the client, the Zoho organisation (with its GSTIN, so similar names are easy to tell apart) and the bank account. Click <strong>Save link</strong>. A client with two bank accounts gets two links.</p>
<figure><img src="/blog/integrations/zoho-2-link.jpg" alt="Linking a FynHelp client to a Zoho organisation and its HDFC bank account" loading="lazy" /><figcaption>Choose the client, then the organisation, then the bank account.</figcaption></figure>

<h2>Step 3: Pull a month</h2>
<p>Pick the month on the client's row and click <strong>Pull month</strong>. FynHelp reads every entry posted to that bank account in the month and files it as one document, for example <em>Zoho Books - HDFC Current A-c - Jul 2026.csv</em>. The row shows how many entries came in and the money in and out, so you can check it against the account in Zoho.</p>
<figure><img src="/blog/integrations/zoho-3-pulled.jpg" alt="Zoho Books card after a pull: 13 entries for July 2026 with money in and out totals" loading="lazy" /><figcaption>After a pull: entries and totals for the month, ready to check against Zoho.</figcaption></figure>

<h2>Step 4: Reconcile as usual</h2>
<p>The pulled ledger appears on the Documents page with Zoho Books as its source. Upload, email or WhatsApp the client's bank statement for the same month as you do today, and Recon matches the two in its five passes. Unmatched lines go to the Exception queue with a reason.</p>
<figure><img src="/blog/integrations/documents-zoho-and-tally.jpg" alt="Documents page listing the Zoho Books ledger next to a bank statement and a Tally export, all parsed" loading="lazy" /><figcaption>The Zoho ledger sits beside the bank statement on the Documents page.</figcaption></figure>

<h2>Pulling again after changes in Zoho</h2>
<p>If the client posts or edits entries after your pull, pull the same month again. FynHelp reads the new version in place of the old one; lines already matched stay matched, and if nothing changed in Zoho you are told so and nothing is redone.</p>

<h2>What FynHelp reads, and what it never does</h2>
<div class="table-wrap"><table>
<thead><tr><th>Reads</th><th>Never does</th></tr></thead>
<tbody>
<tr><td>The list of organisations your login can see</td><td>Create, edit or delete anything in Zoho</td></tr>
<tr><td>Each organisation's active bank accounts</td><td>Post vouchers, journals or bank entries</td></tr>
<tr><td>The ledger entries of the linked bank account, for the month you pull</td><td>Read invoices, contacts or other accounts you did not link</td></tr>
</tbody>
</table></div>
<p>Zoho's sign-in tokens are stored encrypted. To stop access, click <strong>Disconnect</strong> in FynHelp (documents already pulled stay), or remove FynHelp from Connected Apps in your Zoho account.</p>

<h2>Frequently asked questions</h2>

<h3>Does FynHelp write anything back to Zoho Books?</h3>
<p>No. The connection asks only for read access, and FynHelp has no feature that posts to Zoho. Corrections are made in Zoho by your team; the next pull picks them up.</p>

<h3>Can one Zoho login cover all my clients?</h3>
<p>Yes, if each client has added that login as a user of their Zoho Books organisation. Every organisation the login can see appears when you link a client.</p>

<h3>Does the bank statement also come from Zoho?</h3>
<p>No. Zoho gives the books side. The bank side is still the statement your client sends, so Recon compares two independent sources.</p>

<h3>My firm's Zoho account is not in India. Does it work?</h3>
<p>Yes. Zoho signs you in on your own region's server and FynHelp uses that region for every call.</p>
$z$, 'CA resources', array['Zoho Books', 'integrations', 'setup'], 'published', timestamptz '2026-10-15 10:00:00+05:30',
 'FynHelp Editorial Team', 'Month-end close for CA firms', 5, 'Connect Zoho Books to FynHelp: step-by-step guide',
 'Connect Zoho Books to FynHelp read-only: link each client to its Zoho bank account, pull a month''s ledger and reconcile it against the bank statement.', false),

('How to send Tally data to FynHelp from your office PCs', 'tally-export-to-fynhelp',
 'Export the client''s bank ledger from TallyPrime as XML for the month, then upload it on the Documents page or email it to the firm inbox. Works the same on one PC or an office network.',
 $t$<p class="answer"><strong>Short answer</strong>In TallyPrime, open the client's bank ledger (Gateway of Tally → Display More Reports → Account Books → Ledger), set the month with <code>Alt+F2</code>, and export with <code>Alt+E</code> → Current → File Format XML (Data Interchange). Then upload the file on FynHelp's Documents page under the client, or email it to the firm inbox FynHelp reads. Nothing is installed on your PCs.</p>

<p>Most CA firms run TallyPrime on their own Windows PCs: either one PC, or one PC that holds the company data with staff PCs connecting to it over the office network. The steps are the same in both. If your Tally runs on a hosted server you reach through Remote Desktop, see <a href="/blog/tally-on-cloud-to-fynhelp">the Tally on Cloud guide</a> instead.</p>

<figure class="diagram"><img src="/blog/integrations/tally-local.svg" alt="Diagram: on one PC, or from any PC on an office network, Tally exports an XML file that is uploaded or emailed to FynHelp" loading="lazy" width="1200" height="610" /><figcaption>One PC or an office network: export from whichever PC you use, then send the file.</figcaption></figure>

<h2>What to export</h2>
<p>FynHelp needs the books side of each bank account for the month: the vouchers posted to the client's bank ledger. Export the bank ledger rather than the whole Day Book where you can; it keeps the file small and only contains what Recon needs. A Day Book export also works.</p>

<h2>The five steps</h2>
<figure class="diagram"><img src="/blog/integrations/tally-export-steps.svg" alt="Five steps: open the ledger, pick the bank, set the month with Alt+F2, export with Alt+E as XML, send to FynHelp" loading="lazy" width="1200" height="340" /><figcaption>The export path in TallyPrime. Key names are TallyPrime's defaults.</figcaption></figure>
<ol>
<li><strong>Open the ledger.</strong> In the client's company, go to Gateway of Tally → Display More Reports → Account Books → Ledger.</li>
<li><strong>Pick the bank.</strong> Select the bank ledger, for example HDFC Current A/c. Do this once per bank account.</li>
<li><strong>Set the month.</strong> Press <code>Alt+F2</code> and enter the first and last day of the month.</li>
<li><strong>Export.</strong> Press <code>Alt+E</code> → Current. Set File Format to XML (Data Interchange), note the folder it saves to, and export. Excel (Spreadsheet) also works.</li>
<li><strong>Send it to FynHelp.</strong> Upload it, or email it in (below).</li>
</ol>

<h2>Upload on the Documents page</h2>
<p>Open <strong>Documents</strong>, choose the client, and drop the file or click to choose it. FynHelp recognises a Tally export on its own and reads every voucher; you can drop the bank statement in the same place.</p>
<figure><img src="/blog/integrations/tally-1-upload.jpg" alt="FynHelp Documents page: client selector and a drop area for bank statements and Tally exports" loading="lazy" /><figcaption>Choose the client, then drop the Tally file and the bank statement.</figcaption></figure>
<figure><img src="/blog/integrations/documents-zoho-and-tally.jpg" alt="Documents list showing a Tally XML export and a bank statement, both parsed" loading="lazy" /><figcaption>Each file shows its status and how many rows were read.</figcaption></figure>

<h2>Or email it to the firm inbox</h2>
<p>If a partner has connected the firm's Gmail inbox in Settings, files emailed there arrive on their own every few minutes. FynHelp works out the client from the sender; anything it cannot place waits under Unassigned on the Documents page, where you choose the client.</p>

<h2>Common problems</h2>
<ul>
<li><strong>Wrong month:</strong> the export follows the period on screen. Check the first and last dates before exporting.</li>
<li><strong>Two bank accounts:</strong> export each bank ledger separately.</li>
<li><strong>Same file twice:</strong> FynHelp spots an identical file and keeps the first one.</li>
<li><strong>Optional or post-dated vouchers:</strong> leave them out of the month's export.</li>
</ul>

<h2>Frequently asked questions</h2>

<h3>Do I need to install anything for Tally?</h3>
<p>No. The export is an ordinary Tally file, and you send it through the browser or by email.</p>

<h3>Does FynHelp change anything in Tally?</h3>
<p>No. FynHelp reads exports and never writes vouchers back. Corrections are made in Tally by your team, and the next export picks them up.</p>

<h3>XML or Excel?</h3>
<p>XML where you can. It keeps every voucher with its ledger lines and signs. Excel works but flattens the structure.</p>

<h3>We use Tally on an office network. Which PC should export?</h3>
<p>Any PC that can open the client's company. The file is saved on the PC that exported it.</p>
$t$, 'CA resources', array['Tally', 'TallyPrime', 'export', 'setup'], 'published', timestamptz '2026-10-15 10:10:00+05:30',
 'FynHelp Editorial Team', 'Month-end close for CA firms', 5, 'Send Tally data to FynHelp: export and upload guide',
 'Export a client''s bank ledger from TallyPrime as XML and upload or email it to FynHelp. Works on one PC or an office network, nothing to install.', false),

('Tally on Cloud or Remote Desktop: getting exports into FynHelp', 'tally-on-cloud-to-fynhelp',
 'When TallyPrime runs on a hosted machine, export inside the session as usual, then get the file out by uploading from the session''s browser, saving to a drive shared from your PC, or emailing it to the firm inbox.',
 $c$<p class="answer"><strong>Short answer</strong>Export the client's bank ledger as XML inside the remote Tally session, exactly as on a local PC. Then use whichever route your hosting provider allows: open fynhelp.com in the session's browser and upload, save the file to your own PC's drive shared into the session, or email it from the session to the firm inbox FynHelp reads.</p>

<p>Many firms run TallyPrime on a hosted Windows machine (Tally on Cloud, a provider's server, or the firm's own server) and reach it through Remote Desktop. The Tally steps do not change. What changes is where the exported file lands: on the remote machine, not your laptop.</p>

<figure class="diagram"><img src="/blog/integrations/tally-cloud.svg" alt="Diagram: from a remote Tally session, an export reaches FynHelp by uploading from inside, through a shared local drive, or by email" loading="lazy" width="1200" height="500" /><figcaption>Three ways to get the file out. Use the one your provider allows.</figcaption></figure>

<h2>Step 1: Export inside the session</h2>
<p>In the remote session, open the client's bank ledger (Gateway of Tally → Display More Reports → Account Books → Ledger), set the month with <code>Alt+F2</code>, and export with <code>Alt+E</code> → Current → File Format XML (Data Interchange). The full walkthrough with a diagram is in <a href="/blog/tally-export-to-fynhelp">the office PC guide</a>.</p>

<h2>Step 2: Get the file to FynHelp</h2>

<h3>Route 1: Upload from inside the session</h3>
<p>If the remote machine has a browser and internet access, sign in to fynhelp.com there, open Documents, choose the client and upload the file from the export folder. This is the quickest route when it is allowed.</p>

<h3>Route 2: Save to a drive shared from your PC</h3>
<p>Remote Desktop can share a drive from your own computer into the session. On Windows, before connecting: Remote Desktop Connection → Show Options → Local Resources → More → tick the drive. On a Mac, add a redirected folder in the connection's settings. Your drive then appears inside the session; export to it, and upload from your own computer.</p>

<h3>Route 3: Email it to the firm inbox</h3>
<p>If the session can send email, attach the export and send it to the firm inbox a partner has connected in FynHelp Settings. It arrives within minutes; if FynHelp cannot tell which client it belongs to, it waits under Unassigned on the Documents page.</p>
<figure><img src="/blog/integrations/tally-1-upload.jpg" alt="FynHelp Documents page: client selector and a drop area" loading="lazy" /><figcaption>Whichever route you use, the file ends up here under the client.</figcaption></figure>

<h2>If none of the routes is allowed</h2>
<p>Some providers lock sessions down: no browser, no drive sharing, no email. Ask your provider which file-transfer option they support (most offer one) and use it to move the export to your PC, then upload as usual.</p>

<h2>Frequently asked questions</h2>

<h3>Does FynHelp need access to our cloud server?</h3>
<p>No. FynHelp never connects to your server. You export a file and send it; that is all FynHelp sees.</p>

<h3>Is the Tally export the same on cloud and on a local PC?</h3>
<p>Yes. TallyPrime behaves the same; only the location of the saved file differs.</p>

<h3>Which route is safest?</h3>
<p>All three keep the file within your firm's own tools. Uploading from inside the session avoids copying the file to another device at all.</p>
$c$, 'CA resources', array['Tally', 'Tally on Cloud', 'remote desktop', 'setup'], 'published', timestamptz '2026-10-15 10:20:00+05:30',
 'FynHelp Editorial Team', 'Month-end close for CA firms', 4, 'Tally on Cloud or Remote Desktop to FynHelp: guide',
 'Running TallyPrime on a hosted server? Export inside the session, then upload from its browser, use a shared drive, or email the file to FynHelp.', false)
on conflict (slug) do update set
  title = excluded.title, excerpt = excluded.excerpt, content = excluded.content,
  category = excluded.category, tags = excluded.tags, status = 'published',
  author_name = excluded.author_name, author_role = excluded.author_role,
  reading_time_minutes = excluded.reading_time_minutes, seo_title = excluded.seo_title,
  seo_description = excluded.seo_description, is_featured = excluded.is_featured,
  updated_at = now();
