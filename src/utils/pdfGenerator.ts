import { jsPDF } from 'jspdf';
import { ComplianceReport } from '../types';

export function generatePdfReport(report: ComplianceReport) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('152-FZ COMPLIANCE AUDIT REPORT', 14, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Target URL: ${report.target_url}`, 14, 26);
  doc.text(`Date: ${new Date(report.audit_date).toLocaleString('ru-RU')}`, 14, 32);

  // Score Badge
  const scoreText = `${report.compliance_score}/100`;
  doc.setFillColor(
    report.compliance_score >= 85 ? 16 : report.compliance_score >= 60 ? 217 : 225,
    report.compliance_score >= 85 ? 185 : report.compliance_score >= 60 ? 119 : 29,
    report.compliance_score >= 85 ? 129 : report.compliance_score >= 60 ? 6 : 72
  );
  doc.roundedRect(pageWidth - 45, 12, 32, 18, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(scoreText, pageWidth - 36, 23);

  y = 52;

  // Summary Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, pageWidth - 28, 30, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('EXECUTIVE SUMMARY & RISK EVALUATION', 20, y + 8);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`Risk Level: ${report.risk_level}`, 20, y + 15);
  doc.text(`Max Potential Fine (KoAP RF 13.11): ${report.max_potential_fine_rub.toLocaleString('ru-RU')} RUB`, 20, y + 21);
  doc.text(`Scanned Pages: ${report.scanned_pages_count} page(s)`, 20, y + 27);

  y += 38;

  // Key Checklist Items
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('152-FZ Core Compliance Modules', 14, y);
  y += 8;

  const modules = [
    {
      name: '1. Personal Data Forms & Consent Checkboxes',
      status: report.forms_audit.every(f => f.is_compliant) ? 'PASS' : 'VIOLATION',
      desc: `${report.forms_audit.length} form(s) analyzed, ${report.forms_audit.reduce((a, b) => a + b.personal_data_fields.length, 0)} personal data field(s).`
    },
    {
      name: '2. Privacy Policy Document (Art. 18.1)',
      status: report.privacy_policy_audit.found && report.privacy_policy_audit.is_accessible_200 ? 'PASS' : 'VIOLATION',
      desc: report.privacy_policy_audit.found ? `Found (${report.privacy_policy_audit.policy_urls.length} link)` : 'Not found in footer/header'
    },
    {
      name: '3. Cookie Banner & Analytics Notification',
      status: report.cookie_audit.detected && report.cookie_audit.is_compliant ? 'PASS' : 'WARNING',
      desc: report.cookie_audit.detected ? 'Banner detected with consent button' : 'Missing cookie notice'
    },
    {
      name: '4. TLS/SSL Encryption (Art. 19)',
      status: report.ssl_audit.is_https && report.ssl_audit.is_valid ? 'PASS' : 'VIOLATION',
      desc: report.ssl_audit.is_https ? `HTTPS Active (${report.ssl_audit.issuer || 'Valid SSL'}, ${report.ssl_audit.days_left || 0} days left)` : 'Insecure HTTP'
    },
    {
      name: '5. Server DB Localization in RF (Art. 18 part 5)',
      status: report.localization_audit.is_located_in_rf ? 'PASS' : 'CRITICAL VIOLATION',
      desc: `IP: ${report.localization_audit.ip_address || 'N/A'}, Country: ${report.localization_audit.country_name || report.localization_audit.country_code || 'Unknown'}`
    }
  ];

  modules.forEach(m => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, y, pageWidth - 28, 14, 'FD');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(m.name, 18, y + 6);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(m.desc, 18, y + 11);

    const isPass = m.status === 'PASS';
    doc.setFillColor(isPass ? 220 : 254, isPass ? 252 : 226, isPass ? 231 : 226);
    doc.setTextColor(isPass ? 22 : 185, isPass ? 101 : 28, isPass ? 52 : 28);
    doc.roundedRect(pageWidth - 45, y + 3, 27, 8, 1.5, 1.5, 'F');
    doc.text(m.status, pageWidth - 42, y + 8);

    y += 16;
  });

  y += 4;

  // Violations List
  if (report.violations.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Identified Legal Violations (${report.violations.length})`, 14, y);
    y += 8;

    report.violations.slice(0, 3).forEach((v, idx) => {
      doc.setFillColor(255, 241, 242);
      doc.setDrawColor(254, 205, 211);
      doc.roundedRect(14, y, pageWidth - 28, 18, 1.5, 1.5, 'FD');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(159, 18, 57);
      doc.text(`${idx + 1}. [${v.koap_article}] ${v.title}`, 18, y + 6);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`Fine: ${v.fine_range_rub} | Action: ${v.remediation_guide.slice(0, 75)}...`, 18, y + 13);

      y += 21;
    });
  }

  // Footer Note
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Generated by 152-FZ Automated Audit SaaS Engine (Playwright + FastAPI + Celery / Express stack).',
    14,
    285
  );

  doc.save(`audit_152fz_${report.target_url.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}
