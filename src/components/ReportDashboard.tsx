import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  FileDown,
  Copy,
  Check,
  RefreshCw,
  Server,
  Lock,
  FileText,
  CheckSquare,
  Cookie,
  ExternalLink,
  ChevronRight,
  Info,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Code2
} from 'lucide-react';
import { ComplianceReport } from '../types';
import { generatePdfReport } from '../utils/pdfGenerator';

interface ReportDashboardProps {
  report: ComplianceReport;
  onReset: () => void;
}

export const ReportDashboard: React.FC<ReportDashboardProps> = ({ report, onReset }) => {
  const [copiedJson, setCopiedJson] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'violations' | 'forms' | 'policy' | 'cookies' | 'infrastructure'>('violations');

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const isCompliant = report.compliance_score >= 95;
  const isMedium = report.compliance_score >= 60 && report.compliance_score < 95;
  const isCritical = report.risk_level === 'CRITICAL' || report.compliance_score < 40;

  const fineFormatted = report.max_potential_fine_rub.toLocaleString('ru-RU');

  return (
    <div className="space-y-6">
      {/* Top Banner: Score & Risk Overview */}
      <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative">
          {/* Target site and meta */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                Итоговый отчет аудита 152-ФЗ
              </span>
              <span className="text-xs text-[#CBD5E1]">•</span>
              <span className="text-xs text-[#64748B]">
                {new Date(report.audit_date).toLocaleString('ru-RU')}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] font-mono break-all">
              {report.target_url}
            </h2>
            <p className="text-sm text-[#475569] max-w-2xl leading-relaxed">
              {report.summary_text}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-stretch sm:self-auto">
            <button
              id="download-pdf-button"
              onClick={() => generatePdfReport(report)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
            >
              <FileDown className="w-4 h-4" />
              <span>Скачать PDF</span>
            </button>

            <button
              id="copy-json-button"
              onClick={handleCopyJson}
              className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] text-sm font-medium rounded-xl border border-[#E2E8F0] transition-all"
              title="Скопировать сырой JSON-отчет"
            >
              {copiedJson ? <Check className="w-4 h-4 text-[#16A34A]" /> : <Copy className="w-4 h-4 text-[#64748B]" />}
              <span className="hidden sm:inline">{copiedJson ? 'Скопировано' : 'JSON'}</span>
            </button>

            <button
              id="new-scan-button"
              onClick={onReset}
              className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] text-sm font-medium rounded-xl border border-[#E2E8F0] transition-all"
              title="Проверить другой сайт"
            >
              <RefreshCw className="w-4 h-4 text-[#64748B]" />
              <span className="hidden sm:inline">Новый скан</span>
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-[#F1F5F9]">
          {/* Score */}
          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between">
            <div>
              <div className="text-xs text-[#64748B] font-medium">Индекс соответствия 152-ФЗ</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] mt-1">
                {report.compliance_score}
                <span className="text-sm font-normal text-[#94A3B8]"> / 100</span>
              </div>
            </div>
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base border ${
                isCompliant
                  ? 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]'
                  : isMedium
                  ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
                  : 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]'
              }`}
            >
              {report.compliance_score}%
            </div>
          </div>

          {/* Risk Level */}
          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between">
            <div>
              <div className="text-xs text-[#64748B] font-medium">Уровень риска штрафов</div>
              <div
                className={`text-base sm:text-lg font-bold mt-1 flex items-center gap-1.5 ${
                  isCompliant
                    ? 'text-[#16A34A]'
                    : isMedium
                    ? 'text-[#D97706]'
                    : 'text-[#DC2626]'
                }`}
              >
                {isCompliant && <ShieldCheck className="w-5 h-5" />}
                {isMedium && <AlertTriangle className="w-5 h-5" />}
                {isCritical && <ShieldAlert className="w-5 h-5" />}
                <span>
                  {report.risk_level === 'MINIMAL' && 'Минимальный'}
                  {report.risk_level === 'LOW' && 'Низкий'}
                  {report.risk_level === 'MEDIUM' && 'Средний риск'}
                  {report.risk_level === 'HIGH' && 'Высокий риск'}
                  {report.risk_level === 'CRITICAL' && 'КРИТИЧЕСКИЙ'}
                </span>
              </div>
            </div>
            <div className="text-xs text-right text-[#94A3B8] font-mono">
              КоАП 13.11
            </div>
          </div>

          {/* Max Potential Fine */}
          <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between">
            <div>
              <div className="text-xs text-[#64748B] font-medium">Сумма потенциальных штрафов</div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-[#0F172A] mt-1">
                {report.max_potential_fine_rub > 0 ? (
                  <span className="text-[#DC2626]">до {fineFormatted} ₽</span>
                ) : (
                  <span className="text-[#16A34A]">0 ₽</span>
                )}
              </div>
            </div>
            <div className="text-[11px] text-[#64748B] text-right">
              {report.violations.length} нарушение(й)
            </div>
          </div>
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] pb-3">
        <button
          id="subtab-violations"
          onClick={() => setActiveSubTab('violations')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeSubTab === 'violations'
              ? 'bg-[#0F172A] text-white shadow-sm'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <span>Нарушения & Штрафы</span>
          {report.violations.length > 0 && (
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono">
              {report.violations.length}
            </span>
          )}
        </button>

        <button
          id="subtab-forms"
          onClick={() => setActiveSubTab('forms')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeSubTab === 'forms'
              ? 'bg-[#0F172A] text-white shadow-sm'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
          }`}
        >
          <CheckSquare className="w-4 h-4 text-sky-400" />
          <span>Формы и Чекбоксы ({report.forms_audit.length})</span>
        </button>

        <button
          id="subtab-policy"
          onClick={() => setActiveSubTab('policy')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeSubTab === 'policy'
              ? 'bg-[#0F172A] text-white shadow-sm'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
          }`}
        >
          <FileText className="w-4 h-4 text-indigo-400" />
          <span>Политика конфиденциальности</span>
        </button>

        <button
          id="subtab-cookies"
          onClick={() => setActiveSubTab('cookies')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeSubTab === 'cookies'
              ? 'bg-[#0F172A] text-white shadow-sm'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
          }`}
        >
          <Cookie className="w-4 h-4 text-amber-400" />
          <span>Cookie & Трекеры</span>
        </button>

        <button
          id="subtab-infrastructure"
          onClick={() => setActiveSubTab('infrastructure')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeSubTab === 'infrastructure'
              ? 'bg-[#0F172A] text-white shadow-sm'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
          }`}
        >
          <Server className="w-4 h-4 text-emerald-400" />
          <span>Локализация РФ & SSL</span>
        </button>
      </div>

      {/* SUBTAB 1: Violations & Legal Analysis */}
      {activeSubTab === 'violations' && (
        <div className="space-y-4">
          {report.violations.length === 0 ? (
            <div className="p-8 rounded-3xl bg-[#DCFCE7]/60 border border-[#BBF7D0] text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-[#16A34A] mx-auto" />
              <h3 className="text-lg font-bold text-[#166534]">Критических нарушений 152-ФЗ не обнаружено</h3>
              <p className="text-sm text-[#15803D] max-w-xl mx-auto">
                Все проверенные веб-формы содержат обязательные согласия, Политика конфиденциальности доступна,
                сервер расположен на территории Российской Федерации.
              </p>
            </div>
          ) : (
            report.violations.map((violation, idx) => {
              const isCrit = violation.severity === 'CRITICAL';
              const isHigh = violation.severity === 'HIGH';

              return (
                <div
                  key={idx}
                  className={`p-5 sm:p-6 rounded-3xl border transition-all ${
                    isCrit
                      ? 'bg-white border-[#FECACA] shadow-sm'
                      : isHigh
                      ? 'bg-white border-[#FDE68A] shadow-sm'
                      : 'bg-white border-[#E2E8F0] shadow-sm'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                            isCrit
                              ? 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]'
                              : isHigh
                              ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
                              : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]'
                          }`}
                        >
                          {violation.severity === 'CRITICAL' && '🚨 КРИТИЧЕСКИЙ РИСК'}
                          {violation.severity === 'HIGH' && '⚠️ ВЫСОКИЙ РИСК'}
                          {violation.severity === 'MEDIUM' && '⚡ СРЕДНИЙ РИСК'}
                          {violation.severity === 'LOW' && 'ℹ️ НЕЗНАЧИТЕЛЬНО'}
                        </span>
                        <span className="text-xs font-mono font-semibold text-[#64748B] bg-[#F8FAFC] px-2 py-0.5 rounded-md border border-[#E2E8F0]">
                          {violation.koap_article}
                        </span>
                      </div>
                      <h4 className="text-base sm:text-lg font-bold text-[#0F172A] mt-1">
                        {violation.title}
                      </h4>
                    </div>

                    <div className="shrink-0 text-left sm:text-right">
                      <div className="text-xs text-[#64748B]">Штраф для юрлиц:</div>
                      <div className="text-sm sm:text-base font-bold font-mono text-[#DC2626]">
                        {violation.fine_range_rub}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-[#475569] mt-3 leading-relaxed">
                    {violation.description}
                  </p>

                  {violation.location && (
                    <div className="mt-3 text-xs font-mono text-[#475569] bg-[#F8FAFC] p-2.5 rounded-xl border border-[#E2E8F0] flex items-center gap-2">
                      <span className="text-[#94A3B8] font-sans">Элемент:</span>
                      <span className="text-[#2563EB]">{violation.location}</span>
                    </div>
                  )}

                  {/* Remediation */}
                  <div className="mt-4 pt-4 border-t border-[#F1F5F9] flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-lg bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-xs text-[#334155] leading-relaxed">
                      <span className="font-semibold text-[#16A34A]">Как исправить: </span>
                      {violation.remediation_guide}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SUBTAB 2: Forms & Checkboxes */}
      {activeSubTab === 'forms' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B] shadow-sm">
            <span>
              Проанализировано веб-форм: <strong className="text-[#0F172A]">{report.forms_audit.length}</strong>
            </span>
            <span>
              Полей сбора ПДн:{' '}
              <strong className="text-[#0F172A]">
                {report.forms_audit.reduce((sum, f) => sum + f.personal_data_fields.length, 0)}
              </strong>
            </span>
          </div>

          {report.forms_audit.length === 0 ? (
            <div className="p-8 text-center bg-white border border-[#E2E8F0] rounded-3xl text-[#64748B] text-sm shadow-sm">
              На просканированных страницах теги &lt;form&gt; со сбором персональных данных не обнаружены.
            </div>
          ) : (
            report.forms_audit.map((form, idx) => (
              <div key={idx} className="p-6 rounded-3xl bg-white border border-[#E2E8F0] space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-mono text-sm text-[#2563EB] font-semibold">
                    <span>{form.form_selector}</span>
                    <span className="text-xs font-sans text-[#64748B]">на {form.page_url}</span>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border self-start ${
                      form.is_compliant
                        ? 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]'
                        : 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]'
                    }`}
                  >
                    {form.is_compliant ? '✓ Соответствует 152-ФЗ' : '✕ Требует исправления'}
                  </span>
                </div>

                {/* Personal Data Fields Detected */}
                <div>
                  <div className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-2">
                    Обнаруженные поля персональных данных:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.personal_data_fields.map((f, fIdx) => (
                      <div
                        key={fIdx}
                        className="px-2.5 py-1.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs flex items-center gap-2"
                      >
                        <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
                        <span className="text-[#0F172A] font-medium">
                          {f.name || f.placeholder || f.field_type}
                        </span>
                        <span className="text-[10px] text-[#64748B] uppercase font-mono">
                          [{f.pd_category || f.field_type}]
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Checkbox Details */}
                <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#334155]">Наличие чекбокса согласия:</span>
                    <span className={form.checkbox_analysis.exists ? 'text-[#16A34A] font-semibold' : 'text-[#DC2626] font-semibold'}>
                      {form.checkbox_analysis.exists ? 'Обнаружен' : 'ОТСУТСТВУЕТ'}
                    </span>
                  </div>

                  {form.checkbox_analysis.exists && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[#64748B]">Предустановлена галочка (Pre-checked):</span>
                        <span className={form.checkbox_analysis.is_prechecked ? 'text-[#DC2626] font-semibold' : 'text-[#16A34A] font-semibold'}>
                          {form.checkbox_analysis.is_prechecked ? 'ДА (Нарушение ст. 9)' : 'НЕТ (Корректно)'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#64748B]">Наличие ключевых слов согласия:</span>
                        <span className={form.checkbox_analysis.has_consent_keywords ? 'text-[#16A34A]' : 'text-[#D97706]'}>
                          {form.checkbox_analysis.has_consent_keywords ? 'Подтверждено' : 'Неявный текст'}
                        </span>
                      </div>
                      {form.checkbox_analysis.associated_text && (
                        <div className="mt-2 pt-2 border-t border-[#E2E8F0] text-[#475569]">
                          <span className="text-[#64748B]">Текст согласия: </span>
                          <span className="italic">«{form.checkbox_analysis.associated_text}»</span>
                        </div>
                      )}
                      {form.checkbox_analysis.policy_link_url && (
                        <div className="mt-2 pt-2 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[#475569]">
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="text-[#64748B]">Ссылка в форме:</span>
                            <span className="font-mono text-[#2563EB] truncate max-w-xs">{form.checkbox_analysis.policy_link_url}</span>
                          </div>
                          <span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border self-start sm:self-auto ${
                            form.checkbox_analysis.policy_link_is_broken
                              ? 'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]'
                              : 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]'
                          }`}>
                            HTTP {form.checkbox_analysis.policy_link_status_code || (form.checkbox_analysis.policy_link_is_broken ? '404' : '200')} {form.checkbox_analysis.policy_link_is_broken ? '(Битая ссылка)' : '(OK)'}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {form.violations.length > 0 && (
                  <div className="space-y-1">
                    {form.violations.map((v, vIdx) => (
                      <div key={vIdx} className="text-xs text-[#DC2626] flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* SUBTAB 3: Privacy Policy */}
      {activeSubTab === 'policy' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-white border border-[#E2E8F0] space-y-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[#0F172A]">
                Политика в отношении обработки персональных данных
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Требование статьи 18.1 Федерального закона № 152-ФЗ
              </p>
            </div>
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                report.privacy_policy_audit.found && report.privacy_policy_audit.is_accessible_200
                  ? 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]'
                  : 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]'
              }`}
            >
              {report.privacy_policy_audit.found && report.privacy_policy_audit.is_accessible_200
                ? 'Опубликована и доступна (200 OK)'
                : 'Нарушение ст. 18.1'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="text-xs text-[#64748B]">Ссылки на документ:</div>
              {report.privacy_policy_audit.policy_urls.length > 0 ? (
                report.privacy_policy_audit.policy_urls.map((u, i) => (
                  <div key={i} className="text-xs font-mono text-[#2563EB] break-all flex items-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>{u}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-[#DC2626] font-medium">
                  Прямых ссылок на Политику в DOM-дереве не найдено
                </div>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="text-xs text-[#64748B]">Анкоры ссылок:</div>
              <div className="text-xs text-[#334155]">
                {report.privacy_policy_audit.anchor_texts.join(', ') || 'Нет данных'}
              </div>
              <div className="text-[11px] font-mono pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
                <span className="text-[#94A3B8]">Код HTTP-ответа сервера:</span>
                <span className={`font-semibold px-2 py-0.5 rounded ${
                  report.privacy_policy_audit.is_accessible_200
                    ? 'bg-[#DCFCE7] text-[#166534]'
                    : 'bg-[#FEE2E2] text-[#DC2626]'
                }`}>
                  HTTP {report.privacy_policy_audit.http_status_code || (report.privacy_policy_audit.is_accessible_200 ? 200 : 404)}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] text-xs text-[#1E40AF] leading-relaxed">
            <strong>Юридическая справка:</strong> Согласно ст. 18.1 152-ФЗ, оператор обязан опубликовать или иным
            образом обеспечить неограниченный доступ к документу, определяющему его политику обработки ПДн. Ссылка
            должна быть доступна с любой страницы сайта (рекомендуется размещение в сквозном подвале — footer).
          </div>
        </div>
      )}

      {/* SUBTAB 4: Cookies */}
      {activeSubTab === 'cookies' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-white border border-[#E2E8F0] space-y-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[#0F172A]">Файлы Cookie и сторонние трекеры</h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Уведомление пользователей о сборе технических данных и веб-аналитике
              </p>
            </div>
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                report.cookie_audit.detected && report.cookie_audit.is_compliant
                  ? 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]'
                  : 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
              }`}
            >
              {report.cookie_audit.detected ? 'Баннер обнаружен' : 'Баннер не обнаружен'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="text-xs text-[#64748B]">Текст плашки Cookie:</div>
              <div className="text-xs text-[#475569] italic">
                {report.cookie_audit.raw_banner_text || 'Уведомление о Cookie на сайте отсутствует.'}
              </div>
              <div className="text-xs text-[#64748B] pt-2 border-t border-[#E2E8F0] flex justify-between">
                <span>Кнопка согласия («Принять»):</span>
                <span className={report.cookie_audit.has_accept_button ? 'text-[#16A34A] font-semibold' : 'text-[#DC2626]'}>
                  {report.cookie_audit.has_accept_button ? 'Присутствует' : 'Отсутствует'}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="text-xs text-[#64748B]">Обнаруженные счетчики и трекеры:</div>
              <div className="flex flex-wrap gap-1.5">
                {report.cookie_audit.third_party_trackers.length > 0 ? (
                  report.cookie_audit.third_party_trackers.map((tr, i) => (
                    <span key={i} className="px-2 py-1 bg-[#F1F5F9] text-[#2563EB] border border-[#E2E8F0] rounded-lg text-xs font-mono">
                      {tr}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[#94A3B8]">Счетчики не выявлены</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 5: Infrastructure (RF Localization & SSL) */}
      {activeSubTab === 'infrastructure' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Localization */}
          <div className="p-6 rounded-3xl bg-white border border-[#E2E8F0] space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-[#16A34A]" />
              <h3 className="text-base font-bold text-[#0F172A]">Локализация баз данных (ч. 5 ст. 18)</h3>
            </div>

            <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-[#64748B]">IP-адрес сервера:</span>
                <span className="font-mono text-[#0F172A] font-semibold">
                  {report.localization_audit.ip_address || 'Не определен'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Географическая принадлежность:</span>
                <span className="font-semibold text-[#0F172A]">
                  {report.localization_audit.country_name} ({report.localization_audit.country_code})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Провайдер / Хостинг:</span>
                <span className="text-[#334155]">{report.localization_audit.isp || 'N/A'}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#E2E8F0] items-center">
                <span className="text-[#64748B]">Сервер в юрисдикции РФ:</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full font-semibold ${
                    report.localization_audit.is_located_in_rf
                      ? 'bg-[#DCFCE7] text-[#166534]'
                      : 'bg-[#FEE2E2] text-[#991B1B]'
                  }`}
                >
                  {report.localization_audit.is_located_in_rf ? 'СОБЛЮДЕНО (РФ)' : 'НАРУШЕНО (Зарубежный)'}
                </span>
              </div>
            </div>

            {!report.localization_audit.is_located_in_rf && (
              <div className="p-3.5 rounded-2xl bg-[#FEE2E2] border border-[#FECACA] text-xs text-[#991B1B]">
                <strong>Внимание!</strong> Размещение серверов за рубежом влечет штраф по ст. 13.11 ч. 8, 9 КоАП РФ
                от 1 до 6 млн ₽ (повторно до 18 млн ₽) и блокировку Роскомнадзором.
              </div>
            )}
          </div>

          {/* SSL / Encryption */}
          <div className="p-6 rounded-3xl bg-white border border-[#E2E8F0] space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#2563EB]" />
              <h3 className="text-base font-bold text-[#0F172A]">Защита соединения (SSL/TLS)</h3>
            </div>

            <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-[#64748B]">Протокол передачи данных:</span>
                <span className={report.ssl_audit.is_https ? 'text-[#16A34A] font-semibold' : 'text-[#DC2626] font-semibold'}>
                  {report.ssl_audit.is_https ? 'HTTPS (Шифрованный трафик)' : 'HTTP (Незащищенный)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Издатель сертификата (CA):</span>
                <span className="text-[#334155]">{report.ssl_audit.issuer || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Срок действия:</span>
                <span className="text-[#334155]">
                  {report.ssl_audit.days_left !== undefined ? `${report.ssl_audit.days_left} дн.` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#E2E8F0]">
                <span className="text-[#64748B]">Шифрование ПДн (ст. 19):</span>
                <span className={report.ssl_audit.is_valid ? 'text-[#16A34A] font-semibold' : 'text-[#DC2626] font-semibold'}>
                  {report.ssl_audit.is_valid ? 'Обеспечено' : 'Нарушено'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Fix Checklist */}
      {report.quick_fix_checklist.length > 0 && (
        <div className="p-6 sm:p-8 rounded-3xl bg-white border border-[#E2E8F0] space-y-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#0F172A] font-bold text-base">
            <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />
            <span>План первоочередных действий по устранению рисков:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {report.quick_fix_checklist.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#334155] flex items-start gap-2.5"
              >
                <span className="w-5 h-5 rounded-full bg-[#EFF6FF] text-[#2563EB] font-mono font-bold flex items-center justify-center shrink-0 text-[10px]">
                  {idx + 1}
                </span>
                <span className="leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
