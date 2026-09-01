import React from 'react';
import { Scale, BookOpen, AlertTriangle, ShieldCheck, FileText, CheckCircle2 } from 'lucide-react';

export const LawGuide: React.FC = () => {
  const articles = [
    {
      article: 'ст. 13.11 ч. 1 КоАП РФ',
      fine: 'до 150 000 ₽ (повторно до 500 000 ₽)',
      title: 'Обработка ПДн без согласия в случаях, когда оно обязательно',
      description: 'Отсутствие согласия пользователя на сбор и обработку персональных данных (ФИО, телефон, email, паспорт, адрес) через веб-формы на сайте.'
    },
    {
      article: 'ст. 13.11 ч. 2 КоАП РФ',
      fine: 'до 150 000 ₽ (повторно до 500 000 ₽)',
      title: 'Обработка ПДн без письменного согласия, когда оно обязательно',
      description: 'Сбор специальных категорий персональных данных, биометрии или трансграничная передача без надлежащего письменного согласия.'
    },
    {
      article: 'ст. 13.11 ч. 3 КоАП РФ',
      fine: 'до 60 000 ₽',
      title: 'Неопубликование документа, определяющего политику оператора (Политика конфиденциальности)',
      description: 'Нарушение ст. 18.1 152-ФЗ: отсутствие прямой ссылки на Политику обработки ПДн на всех страницах сайта или недоступность документа.'
    },
    {
      article: 'ст. 13.11 ч. 5 КоАП РФ',
      fine: 'до 90 000 ₽ (повторно до 500 000 ₽)',
      title: 'Невыполнение требования субъекта ПДн об уточнении, блокировании или уничтожении',
      description: 'Игнорирование запросов пользователей на отзыв согласия или удаление персональных данных.'
    },
    {
      article: 'ст. 13.11 ч. 8, 9 КоАП РФ',
      fine: 'от 1 000 000 до 6 000 000 ₽ (повторно до 18 000 000 ₽)',
      title: 'Нарушение требования о первичной локализации баз данных в РФ (ч. 5 ст. 18 152-ФЗ)',
      description: 'Запись, систематизация, накопление и хранение персональных данных граждан РФ на серверах и в базах данных, расположенных за пределами Российской Федерации.'
    },
    {
      article: 'ст. 19 152-ФЗ',
      fine: 'Предписание РКН + штраф',
      title: 'Меры по обеспечению безопасности ПДн при их обработке',
      description: 'Обязанность применения сертифицированных средств криптографической защиты (HTTPS, SSL/TLS) при передаче ПДн по открытым каналам связи.'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center border border-[#FDE68A]">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[#0F172A]">
              Правовая база: 152-ФЗ и ст. 13.11 КоАП РФ
            </h2>
            <p className="text-xs text-[#64748B]">
              Таблица штрафов и ключевые регуляторные требования Роскомнадзора к сайтам
            </p>
          </div>
        </div>

        <p className="text-sm text-[#475569] leading-relaxed max-w-4xl">
          С 2021-2024 гг. регулятор существенно ужесточил контроль за сбором персональных данных в сети Интернет.
          Любая веб-форма (обратная связь, регистрация, заказ, подписка) является точкой сбора ПДн и требует
          соблюдения строгих юридических правил.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {articles.map((item, idx) => (
          <div key={idx} className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs font-bold text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-lg border border-[#DBEAFE]">
                {item.article}
              </span>
              <span className="text-xs font-bold font-mono text-[#DC2626] bg-[#FEF2F2] px-2 py-0.5 rounded-lg border border-[#FEE2E2]">
                {item.fine}
              </span>
            </div>

            <h3 className="text-sm font-bold text-[#0F172A] leading-snug">{item.title}</h3>
            <p className="text-xs text-[#64748B] leading-relaxed">{item.description}</p>
          </div>
        ))}
      </div>

      {/* Checklist for developers */}
      <div className="p-6 rounded-3xl bg-white border border-[#E2E8F0] shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-[#0F172A] font-bold text-base">
          <BookOpen className="w-5 h-5 text-[#2563EB]" />
          <span>Чек-лист разработчика для полного соответствия 152-ФЗ:</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#475569]">
          <div className="p-3.5 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
            <span>Не использовать предустановленные чекбоксы согласия (checkbox checked=false)</span>
          </div>
          <div className="p-3.5 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
            <span>Ссылка на Политику конфиденциальности в каждой веб-форме и футере всех страниц</span>
          </div>
          <div className="p-3.5 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
            <span>Плашка уведомления о файлах Cookie с кнопкой подтверждения для пользователей</span>
          </div>
          <div className="p-3.5 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
            <span>Использовать хостинг и СУБД с дата-центрами, физически находящимися в РФ (ч. 5 ст. 18)</span>
          </div>
          <div className="p-3.5 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
            <span>Принудительный редирект на HTTPS и валидный SSL-сертификат на всех поддоменах</span>
          </div>
          <div className="p-3.5 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
            <span>Уведомление Роскомнадзора об обработке персональных данных до начала сбора</span>
          </div>
        </div>
      </div>
    </div>
  );
};
