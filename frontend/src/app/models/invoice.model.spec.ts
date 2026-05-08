import {
  InvoiceHelper,
  InvoiceMetadata,
  InvoiceSection,
} from './invoice.model';

const mockMetadata: InvoiceMetadata = {
  invoice_number: 'INV-2025-00421',
  invoice_date: '2025-04-10',
  due_date: '2025-05-10',
  purchase_order_number: 'PO-99123',
  payment_terms: 'Net 30',
  currency: 'USD',
  vendor_name: 'Sprocket & Cog Office Supplies Co.',
  vendor_address: '100 Cobblestone Lane, Whimsy Harbor, IL 62501',
  customer_name: 'Town of Whimsy Harbor — Procurement',
  customer_address: '1 Town Hall Plaza, Whimsy Harbor, IL 62501',
  billing_address: '1 Town Hall Plaza, Whimsy Harbor, IL 62501',
  shipping_address: '250 Warehouse Road, Whimsy Harbor, IL 62502',
  subtotal: 1200.0,
  tax_amount: 96.0,
  total_amount: 1296.0,
  line_items: [
    { sku: 'PP-LTR-20-CS10', description: 'Printer paper (case of 10 reams)', quantity: 10, unit_price: 40.0, amount: 400.0 },
    { sku: 'TC-BLK-HY', description: 'Toner cartridges, black, high-yield', quantity: 4, unit_price: 200.0, amount: 800.0 },
  ],
};

describe('InvoiceHelper', () => {
  describe('Invoice Information', () => {
    it('returns invoice info fields', () => {
      const fields = InvoiceHelper.getFieldsBySection(
        mockMetadata,
        InvoiceSection.INVOICE_INFO,
      );
      expect(fields.length).toBe(6);
      expect(fields.find((f) => f.key === 'Invoice Number')?.value).toBe('INV-2025-00421');
      expect(fields.find((f) => f.key === 'Purchase Order')?.value).toBe('PO-99123');
      expect(fields.find((f) => f.key === 'Payment Terms')?.value).toBe('Net 30');
      expect(fields.find((f) => f.key === 'Currency')?.value).toBe('USD');
    });

    it('formats the invoice date', () => {
      const fields = InvoiceHelper.getFieldsBySection(
        mockMetadata,
        InvoiceSection.INVOICE_INFO,
      );
      const invoiceDate = fields.find((f) => f.key === 'Invoice Date');
      expect(invoiceDate?.value).toContain('April');
      expect(invoiceDate?.value).toContain('2025');
    });

    it('falls back to Not Available when fields are missing', () => {
      const partial: InvoiceMetadata = { invoice_number: 'X' };
      const fields = InvoiceHelper.getFieldsBySection(partial, InvoiceSection.INVOICE_INFO);
      expect(fields.find((f) => f.key === 'Invoice Number')?.value).toBe('X');
      expect(fields.find((f) => f.key === 'Purchase Order')?.value).toBe('Not Available');
      expect(fields.find((f) => f.key === 'Payment Terms')?.value).toBe('Not Available');
    });
  });

  describe('Vendor Information', () => {
    it('returns vendor fields', () => {
      const fields = InvoiceHelper.getFieldsBySection(
        mockMetadata,
        InvoiceSection.VENDOR_INFO,
      );
      expect(fields.length).toBe(2);
      expect(fields[0]).toEqual({ key: 'Vendor Name', value: 'Sprocket & Cog Office Supplies Co.' });
    });
  });

  describe('Customer Information', () => {
    it('returns customer fields', () => {
      const fields = InvoiceHelper.getFieldsBySection(
        mockMetadata,
        InvoiceSection.CUSTOMER_INFO,
      );
      expect(fields.length).toBe(4);
      expect(fields.find((f) => f.key === 'Billing Address')?.value).toContain('Whimsy Harbor');
    });
  });

  describe('Line Items', () => {
    it('emits a subject-row header plus SKU, quantity, unit price per item', () => {
      const fields = InvoiceHelper.getFieldsBySection(
        mockMetadata,
        InvoiceSection.LINE_ITEMS,
      );
      // 4 rows per item (header + sku + qty + unit price) × 2 items = 8
      expect(fields.length).toBe(8);
      expect(fields[0].key).toBe('---Item 1: Printer paper (case of 10 reams)---');
      expect(fields[0].value).toBe('400.00');
      expect(fields[1]).toEqual({ key: 'SKU', value: 'PP-LTR-20-CS10' });
      expect(fields[2]).toEqual({ key: 'Quantity', value: '10' });
      expect(fields[3]).toEqual({ key: 'Unit Price', value: '40.00' });
    });

    it('falls back to SKU when description is missing', () => {
      const metaNoDesc: InvoiceMetadata = {
        ...mockMetadata,
        line_items: [{ sku: 'WIDGET-01', quantity: 1, unit_price: 10, amount: 10 }],
      };
      const fields = InvoiceHelper.getFieldsBySection(metaNoDesc, InvoiceSection.LINE_ITEMS);
      expect(fields[0].key).toBe('---Item 1: WIDGET-01---');
    });

    it('omits SKU row when a line item has no SKU', () => {
      const metaNoSku: InvoiceMetadata = {
        ...mockMetadata,
        line_items: [{ description: 'Service fee', quantity: 1, unit_price: 50, amount: 50 }],
      };
      const fields = InvoiceHelper.getFieldsBySection(metaNoSku, InvoiceSection.LINE_ITEMS);
      // header + qty + unit price, no sku row
      expect(fields.length).toBe(3);
      expect(fields.map((f) => f.key)).toEqual([
        '---Item 1: Service fee---',
        'Quantity',
        'Unit Price',
      ]);
    });

    it('shows a placeholder row when no line items are present', () => {
      const noItems: InvoiceMetadata = { ...mockMetadata, line_items: [] };
      const fields = InvoiceHelper.getFieldsBySection(noItems, InvoiceSection.LINE_ITEMS);
      expect(fields.length).toBe(1);
      expect(fields[0].key).toBe('No Line Items');
    });
  });

  describe('Totals', () => {
    it('formats numeric totals to 2 decimals', () => {
      const fields = InvoiceHelper.getFieldsBySection(
        mockMetadata,
        InvoiceSection.TOTALS,
      );
      expect(fields).toEqual([
        { key: 'Subtotal', value: '1200.00' },
        { key: 'Tax', value: '96.00' },
        { key: 'Total', value: '1296.00' },
      ]);
    });

    it('falls back to Not Available when totals are missing', () => {
      const empty: InvoiceMetadata = {};
      const fields = InvoiceHelper.getFieldsBySection(empty, InvoiceSection.TOTALS);
      expect(fields.every((f) => f.value === 'Not Available')).toBe(true);
    });
  });

  describe('unknown section', () => {
    it('returns empty array', () => {
      expect(InvoiceHelper.getFieldsBySection(mockMetadata, 'Unknown')).toEqual([]);
    });
  });
});
