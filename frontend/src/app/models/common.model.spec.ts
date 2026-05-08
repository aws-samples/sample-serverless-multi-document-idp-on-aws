import {
  FormatHelper,
  DocumentType,
  normalizeDocumentType,
} from './common.model';

describe('FormatHelper', () => {
  describe('formatDate', () => {
    it('should format a valid ISO date string', () => {
      // Date-only strings are parsed as UTC; toLocaleDateString may shift the day
      // depending on the local timezone. We just verify the year and month are present.
      const result = FormatHelper.formatDate('2024-03-15');
      expect(result).toContain('March');
      expect(result).toContain('2024');
    });

    it('should return "Not Available" for empty string', () => {
      expect(FormatHelper.formatDate('')).toBe('Not Available');
    });

    it('should return the original string for an invalid date', () => {
      expect(FormatHelper.formatDate('not-a-date')).toBe('not-a-date');
    });

    it('should handle date with time component', () => {
      const result = FormatHelper.formatDate('2023-12-25T10:30:00Z');
      expect(result).toContain('2023');
      expect(result).toContain('December');
    });
  });

  describe('formatName', () => {
    it('should format full name with all parts', () => {
      expect(FormatHelper.formatName('John', 'Michael', 'Doe', 'Jr')).toBe(
        'John Michael Doe Jr',
      );
    });

    it('should omit middle name when empty', () => {
      expect(FormatHelper.formatName('Jane', '', 'Smith', '')).toBe(
        'Jane Smith',
      );
    });

    it('should omit suffix when empty', () => {
      expect(FormatHelper.formatName('Alice', 'Marie', 'Johnson', '')).toBe(
        'Alice Marie Johnson',
      );
    });

    it('should handle first and last name only', () => {
      expect(FormatHelper.formatName('Bob', '', 'Brown', '')).toBe(
        'Bob Brown',
      );
    });
  });
});

describe('normalizeDocumentType', () => {
  it('should normalize lowercase "invoice" to INVOICE', () => {
    expect(normalizeDocumentType('invoice')).toBe(DocumentType.INVOICE);
  });

  it('should normalize "Invoices" (plural) to INVOICE', () => {
    expect(normalizeDocumentType('Invoices')).toBe(DocumentType.INVOICE);
  });

  it('should normalize "Business-License" (hyphenated) to BUSINESS_LICENSE', () => {
    expect(normalizeDocumentType('Business-License')).toBe(
      DocumentType.BUSINESS_LICENSE,
    );
  });

  it('should return the raw value when no alias exists', () => {
    expect(normalizeDocumentType('Transcript')).toBe('Transcript');
    expect(normalizeDocumentType('Invoice')).toBe('Invoice');
    expect(normalizeDocumentType('BusinessLicense')).toBe('BusinessLicense');
    expect(normalizeDocumentType('SomeUnknownType')).toBe('SomeUnknownType');
  });
});

describe('DocumentType enum', () => {
  it('should have expected values', () => {
    expect(DocumentType.TRANSCRIPT).toBe('Transcript');
    expect(DocumentType.INVOICE).toBe('Invoice');
    expect(DocumentType.BUSINESS_LICENSE).toBe('BusinessLicense');
  });
});
