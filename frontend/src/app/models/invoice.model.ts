import { DisplayField, FormatHelper } from "./common.model";

export interface InvoiceLineItem {
    sku?: string;
    description?: string;
    quantity?: number | string;
    unit_price?: number | string;
    amount?: number | string;
}

/**
 * Custom BDA Invoice blueprint. Field names match the prompt in BDA_SETUP.md
 * (snake_case throughout). All fields optional so the helper falls back to
 * "Not Available" when BDA leaves a field empty.
 */
export interface InvoiceMetadata {
    invoice_number?: string;
    invoice_date?: string;
    due_date?: string;
    purchase_order_number?: string;
    payment_terms?: string;
    currency?: string;
    vendor_name?: string;
    vendor_address?: string;
    customer_name?: string;
    customer_address?: string;
    billing_address?: string;
    shipping_address?: string;
    subtotal?: number | string;
    tax_amount?: number | string;
    total_amount?: number | string;
    line_items?: InvoiceLineItem[];
}

export enum InvoiceSection {
    // Order matters: sections render top-to-bottom in the 2-column grid in
    // declaration order. LINE_ITEMS is rendered full-width (see
    // isFullWidthSection in review-detail.component.ts), so putting it last
    // gives the reviewer a clean 3-row layout:
    //   Row 1: Invoice Info | Totals     (the two "at a glance" blocks)
    //   Row 2: Vendor Info  | Customer Info
    //   Row 3: Line Items (full width)
    INVOICE_INFO = 'Invoice Information',
    TOTALS = 'Totals',
    VENDOR_INFO = 'Vendor Information',
    CUSTOMER_INFO = 'Customer Information',
    LINE_ITEMS = 'Line Items'
}

export class InvoiceHelper {
    private static readonly NOT_AVAILABLE = 'Not Available';

    static getFieldsBySection(metadata: InvoiceMetadata, section: string): DisplayField[] {
        switch (section) {
            case InvoiceSection.INVOICE_INFO:
                return [
                    { key: 'Invoice Number', value: metadata.invoice_number || this.NOT_AVAILABLE },
                    { key: 'Invoice Date', value: FormatHelper.formatDate(metadata.invoice_date || '') },
                    { key: 'Due Date', value: FormatHelper.formatDate(metadata.due_date || '') },
                    { key: 'Purchase Order', value: metadata.purchase_order_number || this.NOT_AVAILABLE },
                    { key: 'Payment Terms', value: metadata.payment_terms || this.NOT_AVAILABLE },
                    { key: 'Currency', value: metadata.currency || this.NOT_AVAILABLE }
                ];

            case InvoiceSection.VENDOR_INFO:
                return [
                    { key: 'Vendor Name', value: metadata.vendor_name || this.NOT_AVAILABLE },
                    { key: 'Vendor Address', value: metadata.vendor_address || this.NOT_AVAILABLE }
                ];

            case InvoiceSection.CUSTOMER_INFO:
                return [
                    { key: 'Customer Name', value: metadata.customer_name || this.NOT_AVAILABLE },
                    { key: 'Customer Address', value: metadata.customer_address || this.NOT_AVAILABLE },
                    { key: 'Billing Address', value: metadata.billing_address || this.NOT_AVAILABLE },
                    { key: 'Shipping Address', value: metadata.shipping_address || this.NOT_AVAILABLE }
                ];

            case InvoiceSection.LINE_ITEMS:
                return this.getLineItems(metadata);

            case InvoiceSection.TOTALS:
                return [
                    { key: 'Subtotal', value: this.formatAmount(metadata.subtotal) },
                    { key: 'Tax', value: this.formatAmount(metadata.tax_amount) },
                    { key: 'Total', value: this.formatAmount(metadata.total_amount) }
                ];

            default:
                return [];
        }
    }

    private static getLineItems(metadata: InvoiceMetadata): DisplayField[] {
        if (!metadata.line_items?.length) {
            return [{ key: 'No Line Items', value: 'No line items extracted' }];
        }

        const rows: DisplayField[] = [];
        metadata.line_items.forEach((item, index) => {
            const description = item.description || item.sku || this.NOT_AVAILABLE;
            const amount = this.formatAmount(item.amount);
            // Subject row: "Item N: description" on the left, amount on the right.
            // The `---` markers trigger the subject-row style in review-detail.component.html;
            // formatKey() strips them before display.
            rows.push({
                key: `---Item ${index + 1}: ${description}---`,
                value: amount,
            });
            if (item.sku) {
                rows.push({ key: 'SKU', value: item.sku });
            }
            rows.push({
                key: 'Quantity',
                value: item.quantity != null && item.quantity !== '' ? String(item.quantity) : this.NOT_AVAILABLE,
            });
            rows.push({
                key: 'Unit Price',
                value: this.formatAmount(item.unit_price),
            });
        });
        return rows;
    }

    private static formatAmount(value: number | string | undefined | null): string {
        if (value == null || value === '') return this.NOT_AVAILABLE;
        const num = typeof value === 'number' ? value : Number(value);
        if (isNaN(num)) return String(value);
        return num.toFixed(2);
    }
}
