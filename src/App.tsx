import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { ScanInput } from './components/ScanInput';
import { ScanProgress } from './components/ScanProgress';
import { ReportDashboard } from './components/ReportDashboard';
import { PythonCodeViewer } from './components/PythonCodeViewer';
import { LawGuide } from './components/LawGuide';
import { StreamlitEmbedView } from './components/StreamlitEmbedView';
import { ComplianceReport, PresetSite, TaskStatusResponse } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'scanner' | 'python_code' | 'law_guide' | 'streamlit_embed'>('scanner');
  const [presets, setPresets] = useState<PresetSite[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState<string>('');
  const [statusData, setStatusData] = useState<TaskStatusResponse | null>(null);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pollIntervalRef = useRef<any>(null);

  // Fetch presets on mount
  useEffect(() => {
    fetch('/api/presets')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setPresets(data);
      })
      .catch((err) => console.error('Failed to load presets:', err));
  }, []);

  // Polling task status
  useEffect(() => {
    if (!currentTaskId || !isScanning) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/status/${currentTaskId}`);
        if (!res.ok) throw new Error('Ошибка получения статуса задачи');
        const data: TaskStatusResponse = await res.json();
        setStatusData(data);

        if (data.status === 'COMPLETED') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          // Fetch final report
          const repRes = await fetch(`/api/report/${currentTaskId}`);
          if (repRes.ok) {
            const repData = await repRes.json();
            setReport(repData.report);
          }
          setIsScanning(false);
        } else if (data.status === 'FAILED') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setErrorMsg(data.error_message || 'Аудит завершился с ошибкой');
          setIsScanning(false);
        }
      } catch (err: any) {
        console.error('Polling error:', err);
      }
    };

    pollIntervalRef.current = setInterval(checkStatus, 500);
    checkStatus();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [currentTaskId, isScanning]);

  const handleStartScan = async (url: string, deepScan: boolean, maxPages: number) => {
    setErrorMsg(null);
    setReport(null);
    setStatusData(null);
    setTargetUrl(url);
    setIsScanning(true);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, deepScan, maxPages }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Ошибка запуска сканирования (${res.status})`);
      }

      const data = await res.json();
      setCurrentTaskId(data.task_id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Не удалось запустить задачу аудита');
      setIsScanning(false);
    }
  };

  const handleReset = () => {
    setReport(null);
    setStatusData(null);
    setCurrentTaskId(null);
    setIsScanning(false);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col selection:bg-[#2563EB] selection:text-white font-sans">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'scanner' && (
          <div className="space-y-8">
            {errorMsg && (
              <div className="p-4 rounded-2xl bg-[#FEF2F2] border border-[#FEE2E2] text-[#DC2626] text-sm flex items-center justify-between shadow-sm">
                <span className="font-medium">{errorMsg}</span>
                <button
                  onClick={() => setErrorMsg(null)}
                  className="text-xs px-3 py-1 bg-white hover:bg-rose-50 border border-[#FEE2E2] rounded-xl text-[#DC2626] font-medium transition-all"
                >
                  Закрыть
                </button>
              </div>
            )}

            {!isScanning && !report && (
              <ScanInput
                onStartScan={handleStartScan}
                isLoading={isScanning}
                presets={presets}
              />
            )}

            {isScanning && (
              <ScanProgress
                statusData={statusData}
                targetUrl={targetUrl}
              />
            )}

            {report && !isScanning && (
              <ReportDashboard
                report={report}
                onReset={handleReset}
              />
            )}
          </div>
        )}

        {activeTab === 'streamlit_embed' && <StreamlitEmbedView />}

        {activeTab === 'python_code' && <PythonCodeViewer />}

        {activeTab === 'law_guide' && <LawGuide />}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E2E8F0] bg-white py-6 text-center text-xs text-[#64748B] mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="font-medium text-[#475569]">
            152-ФЗ SaaS Auditor • Автоматизированный анализ веб-ресурсов на соответствие 152-ФЗ и КоАП РФ
          </div>
          <div className="flex items-center gap-3 text-[#94A3B8] font-mono text-[11px]">
            <span>FastAPI 0.110+</span>
            <span>•</span>
            <span>SQLAlchemy 2.0</span>
            <span>•</span>
            <span>Celery & Redis</span>
            <span>•</span>
            <span>Playwright Chromium</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
