import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer"

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 48,
    backgroundColor: "#F9F7F4",
    color: "#0A0A0A",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 40,
  },
  brand: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
  },
  brandSub: {
    fontSize: 9,
    color: "#71717a",
    marginTop: 2,
  },
  invoiceLabel: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  invoiceNumber: {
    fontSize: 11,
    color: "#71717a",
    textAlign: "right",
    marginTop: 4,
  },
  divider: {
    borderBottom: "1 solid #E5E1DB",
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
    fontSize: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#C8C0B4",
    marginBottom: 6,
  },
  colValue: {
    fontSize: 10,
    color: "#0A0A0A",
    lineHeight: 1.5,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0A0A0A",
    padding: "8 12",
    marginBottom: 0,
  },
  tableHeaderText: {
    color: "#F9F7F4",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    padding: "8 12",
    borderBottom: "1 solid #E5E1DB",
  },
  tableRowAlt: {
    flexDirection: "row",
    padding: "8 12",
    borderBottom: "1 solid #E5E1DB",
    backgroundColor: "#FDFCFA",
  },
  cell: {
    fontSize: 9,
    color: "#0A0A0A",
  },
  colDesc: { flex: 3 },
  colQty: { flex: 1, textAlign: "center" },
  colUnit: { flex: 1.5, textAlign: "right" },
  colTotal: { flex: 1.5, textAlign: "right" },
  totalsSection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
  },
  totalsTable: {
    width: 220,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "5 0",
    borderBottom: "1 solid #E5E1DB",
  },
  totalsLabel: {
    fontSize: 9,
    color: "#71717a",
  },
  totalsValue: {
    fontSize: 9,
    color: "#0A0A0A",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "8 0",
  },
  grandTotalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  grandTotalValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  statusBadge: {
    padding: "3 8",
    fontSize: 8,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 48,
    right: 48,
    borderTop: "1 solid #E5E1DB",
    paddingTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 8,
    color: "#C8C0B4",
  },
})

interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

interface InvoicePDFProps {
  invoiceNumber: string
  status: string
  issuedAt: string
  dueAt?: string | null
  paidAt?: string | null
  clientName: string
  clientEmail?: string | null
  items: InvoiceItem[]
  subtotal: number
  tax?: number
  total: number
  notes?: string | null
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function formatCurrency(amount: number) {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

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
  total,
  notes,
}: InvoicePDFProps) {
  const statusColors: Record<string, string> = {
    PAID: "#15803d",
    PENDING: "#ca8a04",
    OVERDUE: "#dc2626",
    DRAFT: "#71717a",
  }
  const statusColor = statusColors[status] ?? "#71717a"

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>TBGC</Text>
            <Text style={styles.brandSub}>Truffle Boys &amp; Girls Club</Text>
            <Text style={styles.brandSub}>truffleboys.com</Text>
            <Text style={styles.brandSub}>orders@truffleboys.com</Text>
          </View>
          <View>
            <Text style={styles.invoiceLabel}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{invoiceNumber}</Text>
            <Text style={{ ...styles.statusBadge, color: statusColor }}>
              {status}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Bill To / Invoice Details */}
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.colLabel}>Bill To</Text>
            <Text style={styles.colValue}>{clientName}</Text>
            {clientEmail ? <Text style={styles.colValue}>{clientEmail}</Text> : null}
          </View>
          <View style={{ ...styles.col, alignItems: "flex-end" }}>
            <Text style={styles.colLabel}>Invoice Details</Text>
            <Text style={styles.colValue}>Issued: {formatDate(issuedAt)}</Text>
            {dueAt ? <Text style={styles.colValue}>Due: {formatDate(dueAt)}</Text> : null}
            {paidAt ? <Text style={{ ...styles.colValue, color: "#15803d" }}>Paid: {formatDate(paidAt)}</Text> : null}
          </View>
        </View>

        {/* Line Items Table */}
        <View style={styles.tableHeader}>
          <Text style={{ ...styles.tableHeaderText, ...styles.colDesc }}>Description</Text>
          <Text style={{ ...styles.tableHeaderText, ...styles.colQty }}>Qty</Text>
          <Text style={{ ...styles.tableHeaderText, ...styles.colUnit }}>Unit Price</Text>
          <Text style={{ ...styles.tableHeaderText, ...styles.colTotal }}>Total</Text>
        </View>
        {items.map((item, i) => (
          <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={{ ...styles.cell, ...styles.colDesc }}>{item.description}</Text>
            <Text style={{ ...styles.cell, ...styles.colQty }}>{item.quantity}</Text>
            <Text style={{ ...styles.cell, ...styles.colUnit }}>{formatCurrency(item.unitPrice)}</Text>
            <Text style={{ ...styles.cell, ...styles.colTotal }}>{formatCurrency(item.total)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsTable}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{formatCurrency(subtotal)}</Text>
            </View>
            {tax != null && tax > 0 ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Tax</Text>
                <Text style={styles.totalsValue}>{formatCurrency(tax)}</Text>
              </View>
            ) : null}
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Total Due</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(total)}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {notes ? (
          <View style={{ marginTop: 24 }}>
            <Text style={styles.colLabel}>Notes</Text>
            <Text style={{ ...styles.colValue, color: "#71717a" }}>{notes}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Truffle Boys &amp; Girls Club · Los Angeles, CA</Text>
          <Text style={styles.footerText}>Thank you for your business.</Text>
        </View>
      </Page>
    </Document>
  )
}
