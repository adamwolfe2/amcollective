import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 48,
    backgroundColor: "#FFFFFF",
    color: "#0A0A0A",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
    borderBottom: "1 solid #0A0A0A",
    paddingBottom: 16,
  },
  orgName: {
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#666",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  orgSub: {
    fontSize: 8,
    color: "#999",
    marginTop: 2,
  },
  invoiceTitle: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  invoiceNumber: {
    fontSize: 10,
    color: "#666",
    textAlign: "right",
    marginTop: 4,
  },
  statusText: {
    fontSize: 8,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    marginTop: 4,
  },
  divider: {
    borderBottom: "0.5 solid #E5E5E5",
    marginBottom: 24,
    marginTop: 4,
  },
  twoCol: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  col: {
    flex: 1,
  },
  colLabel: {
    fontSize: 7,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#999",
    marginBottom: 6,
    fontFamily: "Helvetica",
  },
  colValue: {
    fontSize: 10,
    color: "#0A0A0A",
    lineHeight: 1.5,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottom: "1 solid #0A0A0A",
    paddingBottom: 4,
    marginBottom: 0,
  },
  tableHeaderText: {
    color: "#666",
    fontSize: 7,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: "Helvetica",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottom: "0.5 solid #eee",
  },
  cell: {
    fontSize: 9,
    color: "#0A0A0A",
  },
  colDesc: { flex: 3 },
  colQty: { width: 40, textAlign: "center" },
  colUnit: { width: 70, textAlign: "right" },
  colTotal: { width: 70, textAlign: "right" },
  totalsSection: {
    marginTop: 16,
    alignItems: "flex-end",
  },
  totalsTable: {
    width: 220,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "4 0",
  },
  totalsLabel: {
    fontSize: 8,
    color: "#666",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  totalsValue: {
    fontSize: 9,
    color: "#0A0A0A",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: "1.5 solid #0A0A0A",
    paddingTop: 6,
    marginTop: 4,
  },
  grandTotalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  grandTotalValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
  },
  notes: {
    marginTop: 32,
    padding: 12,
    backgroundColor: "#F3F3EF",
    fontSize: 9,
    color: "#666",
  },
  notesLabel: {
    fontSize: 7,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#999",
    marginBottom: 4,
  },
  paymentLink: {
    marginTop: 24,
    padding: 12,
    border: "1 solid #0A0A0A",
    fontSize: 9,
  },
  paymentLinkLabel: {
    fontSize: 7,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#666",
    marginBottom: 4,
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 48,
    right: 48,
    borderTop: "0.5 solid #eee",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: "#999",
    letterSpacing: 0.5,
  },
});

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total?: number;
}

export interface InvoicePDFProps {
  invoiceNumber: string;
  status: string;
  issuedAt: string;
  dueAt?: string | null;
  paidAt?: string | null;
  clientName: string;
  clientEmail?: string | null;
  items: InvoiceItem[];
  subtotal: number;
  tax?: number;
  taxRate?: number;
  total: number;
  notes?: string | null;
  paymentLinkUrl?: string | null;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const STATUS_COLORS: Record<string, string> = {
  paid: "#15803d",
  sent: "#1d4ed8",
  overdue: "#dc2626",
  draft: "#71717a",
  open: "#ca8a04",
  void: "#71717a",
  cancelled: "#71717a",
};

export function InvoicePDF({
  invoiceNumber,
  status,
  issuedAt,
  dueAt,
  paidAt,
  clientName,
  clientEmail,
  items,
  subtotal,
  tax,
  taxRate,
  total,
  notes,
  paymentLinkUrl,
}: InvoicePDFProps) {
  const statusColor = STATUS_COLORS[status] ?? "#71717a";

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.orgName}>AM Collective Capital</Text>
            <Text style={styles.orgSub}>team@amcollectivecapital.com</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>Invoice</Text>
            <Text style={styles.invoiceNumber}>{invoiceNumber}</Text>
            <Text style={{ ...styles.statusText, color: statusColor }}>
              {status.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Bill To / Invoice Details */}
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Bill To</Text>
            <Text style={styles.colValue}>{clientName}</Text>
            {clientEmail ? (
              <Text style={{ ...styles.colValue, fontSize: 9, color: "#666" }}>
                {clientEmail}
              </Text>
            ) : null}
          </View>
          <View style={{ ...styles.col, alignItems: "flex-end" }}>
            <Text style={styles.colLabel}>Invoice Details</Text>
            <Text style={styles.colValue}>Issued: {formatDate(issuedAt)}</Text>
            {dueAt ? (
              <Text style={styles.colValue}>Due: {formatDate(dueAt)}</Text>
            ) : null}
            {paidAt ? (
              <Text style={{ ...styles.colValue, color: "#15803d" }}>
                Paid: {formatDate(paidAt)}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Line Items Table Header */}
        <View style={styles.tableHeader}>
          <Text style={{ ...styles.tableHeaderText, ...styles.colDesc }}>
            Description
          </Text>
          <Text style={{ ...styles.tableHeaderText, ...styles.colQty }}>
            Qty
          </Text>
          <Text style={{ ...styles.tableHeaderText, ...styles.colUnit }}>
            Unit Price
          </Text>
          <Text style={{ ...styles.tableHeaderText, ...styles.colTotal }}>
            Amount
          </Text>
        </View>

        {/* Line Items */}
        {items.map((item, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={{ ...styles.cell, ...styles.colDesc }}>
              {item.description}
            </Text>
            <Text style={{ ...styles.cell, ...styles.colQty }}>
              {item.quantity}
            </Text>
            <Text style={{ ...styles.cell, ...styles.colUnit }}>
              {formatCurrency(item.unitPrice)}
            </Text>
            <Text style={{ ...styles.cell, ...styles.colTotal }}>
              {formatCurrency(
                item.total ?? item.quantity * item.unitPrice
              )}
            </Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsTable}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>
                {formatCurrency(subtotal)}
              </Text>
            </View>
            {(tax ?? 0) > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>
                  Tax{taxRate ? ` (${(taxRate / 100).toFixed(1)}%)` : ""}
                </Text>
                <Text style={styles.totalsValue}>
                  {formatCurrency(tax ?? 0)}
                </Text>
              </View>
            )}
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Total Due</Text>
              <Text style={styles.grandTotalValue}>
                {formatCurrency(total)}
              </Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text>{notes}</Text>
          </View>
        ) : null}

        {/* Payment link */}
        {paymentLinkUrl ? (
          <View style={styles.paymentLink}>
            <Text style={styles.paymentLinkLabel}>Pay Online</Text>
            <Text>{paymentLinkUrl}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            AM Collective Capital — team@amcollectivecapital.com
          </Text>
          <Text style={styles.footerText}>{invoiceNumber}</Text>
        </View>
      </Page>
    </Document>
  );
}
