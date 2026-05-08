# Bedrock Data Automation (BDA) Project Setup

Create the BDA project and the three custom blueprints the application uses: `Invoice`, `Transcript`, `BusinessLicense`.

Blueprint names must match the frontend's `DocumentType` enum in [`common.model.ts`](frontend/src/app/models/common.model.ts) exactly, otherwise results display as `UNKNOWN`:

| Blueprint | Required Name | Frontend Model |
|-----------|--------------|----------------|
| Invoice | `Invoice` | [`invoice.model.ts`](frontend/src/app/models/invoice.model.ts) |
| Transcript | `Transcript` | [`us-transcript.model.ts`](frontend/src/app/models/us-transcript.model.ts) |
| Business License | `BusinessLicense` | [`business-license.model.ts`](frontend/src/app/models/business-license.model.ts) |

## 1. Create the project

1. [Amazon Bedrock console](https://console.aws.amazon.com/bedrock/) → **Data Automation** → **Set up projects** → **Create project**
2. Name it `idp-workshop-project` (or match your `$BDA_PROJECT_NAME`), click **Create**

## 2. Create the custom blueprints

For each blueprint: **Manage blueprints** → **Create blueprint** → upload the sample PDF → paste the prompt → **Generate blueprint** → name it **exactly** as shown → **Save and exit** → **Add to project** → select your project → **Overwrite configuration**.

### Invoice

Upload `assets/sample-data/sample-invoice.pdf`. Prompt:

```
I want a blueprint for a vendor invoice that contains the following
15 fields: invoice_number, invoice_date, due_date,
purchase_order_number, payment_terms, currency, vendor_name,
vendor_address, customer_name, customer_address, billing_address,
shipping_address, line_items: [line_item], subtotal, tax_amount,
total_amount. Custom type line_item: (sku, description, quantity,
unit_price, amount).
```

Name: **Invoice**

### Transcript

Upload `assets/sample-data/sample-us-hs-transcript.pdf`. Prompt:

```
I want a blueprint that contains the following 7 fields: student_name,
student_gender, student_birthdate, school_name, school_address,
student_address, courses: [course_details] and with this 1 custom type:
course_details: (course_name, credits, grade, grade_level, academic_year)
```

Name: **Transcript**

### BusinessLicense

Upload `assets/sample-data/sample-business-license.pdf`. Prompt:

```
I want a blueprint for a state or local government business license that
contains the following 12 fields: license_number, license_type,
license_status, business_name, dba_name, business_address,
business_phone, naics_code, owner_name, issuing_authority, issue_date,
expiration_date.
```

Name: **BusinessLicense** (no space)

## 3. Verify

Open your project → **Custom output** tab. You should see:

- Document splitter: enabled
- Three custom blueprints: `Invoice`, `Transcript`, `BusinessLicense`

Use the project's **Test** feature to upload each sample and confirm the expected blueprint matches.

After deployment, upload each sample through the frontend. If a document shows `UNKNOWN`, download `output-files/{job-id}/job_metadata.json` from S3 — `custom_output_status: NO_MATCH` means the project classifier rejected the document against every blueprint.

## Notes

- **Custom over standard blueprints.** All three are custom so matching is deterministic against your exact sample. You own the field names and the blueprint itself.
- **Manual setup by design.** BDA projects and blueprints can be managed via CDK (`aws-bedrock.CfnDataAutomationProject`, `aws-bedrock.CfnBlueprint`); this workshop uses the console so you see the blueprint authoring UI. For development, see [NEXT_STEPS.md — Promote the BDA project to CDK](NEXT_STEPS.md#promote-the-bda-project-to-cdk).
- **`snake_case` field names.** The blueprint prompts use `snake_case` so the generated schema matches the TypeScript interfaces in the frontend models.
- **Transcript groups by grade.** The `courses` array carries `grade_level` and `academic_year` per row; the review screen groups them by `Grade N · YYYY-YYYY`.
