import {
  BusinessLicenseHelper,
  BusinessLicenseMetadata,
  BusinessLicenseSection,
} from './business-license.model';

const mockMetadata: BusinessLicenseMetadata = {
  license_number: 'BL-2025-004871',
  license_type: 'General Business',
  license_status: 'Active',
  business_name: 'Whisker & Paw Consulting LLC',
  dba_name: 'Whisker & Paw',
  business_address: '500 Lakeview Drive, Suite 200, Whimsy Harbor, IL 62501',
  business_phone: '555-010-0134',
  naics_code: '541611',
  owner_name: 'Winston T. Waddlebottom',
  issuing_authority: 'Town of Whimsy Harbor — Department of Business Licensing',
  issue_date: '2025-01-15',
  expiration_date: '2026-01-14',
};

describe('BusinessLicenseHelper', () => {
  describe('License Information', () => {
    it('returns license info fields including issuing authority and dates', () => {
      const fields = BusinessLicenseHelper.getFieldsBySection(
        mockMetadata,
        BusinessLicenseSection.LICENSE_INFO,
      );
      expect(fields.length).toBe(6);
      expect(fields.find((f) => f.key === 'License Number')?.value).toBe('BL-2025-004871');
      expect(fields.find((f) => f.key === 'Status')?.value).toBe('Active');
      expect(fields.find((f) => f.key === 'Issuing Authority')?.value).toContain('Whimsy Harbor');
    });

    it('formats the issue date', () => {
      const fields = BusinessLicenseHelper.getFieldsBySection(
        mockMetadata,
        BusinessLicenseSection.LICENSE_INFO,
      );
      const issueDate = fields.find((f) => f.key === 'Issue Date');
      expect(issueDate?.value).toContain('January');
      expect(issueDate?.value).toContain('2025');
    });
  });

  describe('Business Information', () => {
    it('returns business fields', () => {
      const fields = BusinessLicenseHelper.getFieldsBySection(
        mockMetadata,
        BusinessLicenseSection.BUSINESS_INFO,
      );
      expect(fields.length).toBe(6);
      expect(fields.find((f) => f.key === 'Business Name')?.value).toBe(
        'Whisker & Paw Consulting LLC',
      );
      expect(fields.find((f) => f.key === 'DBA Name')?.value).toBe('Whisker & Paw');
      expect(fields.find((f) => f.key === 'NAICS Code')?.value).toBe('541611');
    });

    it('falls back to Not Available when fields are missing', () => {
      const partial: BusinessLicenseMetadata = { business_name: 'Pepperpot & Tinkerton LLC' };
      const fields = BusinessLicenseHelper.getFieldsBySection(
        partial,
        BusinessLicenseSection.BUSINESS_INFO,
      );
      expect(fields.find((f) => f.key === 'Business Name')?.value).toBe('Pepperpot & Tinkerton LLC');
      expect(fields.find((f) => f.key === 'DBA Name')?.value).toBe('Not Available');
      expect(fields.find((f) => f.key === 'NAICS Code')?.value).toBe('Not Available');
    });
  });

  describe('unknown section', () => {
    it('returns empty array', () => {
      expect(
        BusinessLicenseHelper.getFieldsBySection(mockMetadata, 'Unknown'),
      ).toEqual([]);
    });
  });
});
