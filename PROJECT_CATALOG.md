# AlgoHub — каталог 32 продуктовых концепций

Версия: 0.1 · 2026-11-11 · Статус: гипотезы, не подтверждённые исследованиями рынка.

## Видение
Единая платформа алгоритмических приложений с общим входом, каталогом и дизайн-системой. Каждый продукт — самостоятельный bounded context с собственными API, данными, тестами и возможностью отдельного деплоя. Запускать постепенно, не строить 32 сервиса одновременно.

## Продукты
| ID | Название | Назначение | Алгоритмическое ядро | Потенциальная монетизация |
|---|---|---|---|---|
| P01 | Meet-in-the-Middle / Jinal | Справедливое место встречи друзей с учётом дороги и заведений | minimax travel time, facility location, routing | партнёрства с заведениями |
| P02 | OneWay | Оптимальный маршрут по нескольким поручениям с дедлайнами | TSP with time windows / VRP | подписка, локальные партнёры |
| P03 | TogetherRide | Оптимальное распределение пассажиров по машинам друзей | capacitated VRP, matching | группы, мероприятия |
| P04 | GoNow | Когда выйти с учётом задержек, парковки и остановок | stochastic scheduling | premium |
| P05 | FreeTogether | Общее удобное время для группы с учётом дороги | constraint satisfaction | команды, premium |
| P06 | BasketBrain | Минимальная полная стоимость продуктовой корзины | integer programming, set cover | affiliate, premium |
| P07 | FairSplit | Минимизация взаимных переводов по общим расходам | graph flow, debt simplification | premium |
| P08 | LiveWhere | Оптимальный район проживания с учётом поездок и стоимости | facility location, multiobjective optimization | лиды недвижимости |
| P09 | ParkSmart | Поиск парковки с оценкой вероятности свободного места | spatial forecasting, shortest path | premium, B2B |
| P10 | EatTogether | Компромиссный ресторан для группы | social choice, Pareto ranking | партнёрства |
| P11 | QueueSwap | Выбор филиала и времени с минимальным ожиданием | queueing theory, forecasting | B2B |
| P12 | LifeOptimizer | Что успеть сделать в свободное окно | scheduling, contextual bandits | premium |
| P13 | WalkMatch | Совпадение прогулочных маршрутов и доступности людей | graph matching, clustering | premium, events |
| P14 | FlightReady | Когда выходить в аэропорт | Monte Carlo, probabilistic scheduling | premium, travel B2B |
| P15 | NoMoreDebate | Быстрое групповое решение без бесконечных споров | ranked choice, minimax regret | sponsored recommendations |
| P16 | PerfectWindow | Оптимальное время для дел по погоде и календарю | forecast + constraints | premium, leads |
| P17 | FairTeams | Сбалансированные любительские спортивные команды | balanced partition, Elo | турниры, команды |
| P18 | PriceDNA | Оценка справедливой цены б/у товара | nearest neighbors, robust regression | платные отчёты |
| P19 | GroupBuy | Совместные закупки соседей | clustering, bin packing, routing | комиссия поставщика |
| P20 | SubscriptionHunter | Выявление повторных и ненужных списаний из выписки | periodicity, anomaly detection | аудит, premium |
| P21 | DealOrWait | Покупать товар сейчас или ждать скидку | time series, Bayesian decision | affiliate, premium |
| P22 | RepairOrReplace | Экономическое сравнение ремонта и замены техники | survival analysis, expected cost | лиды сервисам |
| P23 | QuietHome | Оценка шума вокруг жилья | spatial interpolation, noise model | отчёты, API |
| P24 | SunFlat | Моделирование солнечного света и теней квартиры | solar geometry, ray tracing | отчёты, B2B |
| P25 | RentRadar | Сравнение аренды с полной стоимостью жизни и дороги | multiobjective optimization | лиды, premium |
| P26 | MoveOptimizer | Планирование переезда и загрузки транспорта | 3D bin packing, scheduling | лиды мувингу |
| P27 | SafeWalk | Пешеходные маршруты по комфорту и инфраструктуре | multicriteria shortest path | B2B, tourism |
| P28 | SlotGenius | Оптимизация записи и загрузки салонов | interval scheduling, CSP | SaaS |
| P29 | CourierPool | Объединение доставок нескольких магазинов | VRP, clustering | SaaS / за доставку |
| P30 | StockMind | Прогноз закупок и остатков малого бизнеса | forecasting, newsvendor | SaaS |
| P31 | ShiftFair | Составление справедливых графиков смен | CP-SAT, ILP | SaaS |
| P32 | AppointmentRescue | Заполнение отменённых записей из листа ожидания | bipartite matching | SaaS / успешный слот |

## Приоритеты запуска
- Wave 0: платформа, каталог, auth (по необходимости), дизайн-система, шаблон приложения, CI.
- Wave 1: P15 NoMoreDebate (малый внешний data dependency), P17 FairTeams, P31 ShiftFair.
- Wave 2: P01 Jinal, P28 SlotGenius, P32 AppointmentRescue.
- Wave 3: P30 StockMind, P18 PriceDNA, P24 SunFlat — после получения/проверки данных.
- Остальные: по итогам интервью, unit economics и доступности API.

## Для каждого проекта — обязательный контракт
1. `README.md`: проблема, персона, ценность, конкурентные альтернативы, допущения.
2. `PRD.md`: сценарии, UX, критерии приёмки, нецели.
3. `ARCHITECTURE.md`: границы, модель данных, API, алгоритмы, ошибки, безопасность.
4. `OPENAPI.yaml` или контрактные типы; версионирование API.
5. Web UI: mobile-first, accessibility, пустые состояния, loading/error, demo fixtures.
6. Тесты: unit, property-based для алгоритмов, integration, e2e для happy path.
7. `VALIDATION.md`: измеряемая гипотеза, метрики, эксперимент, критерий остановки.
8. `STATUS.md`: готово/не готово, риски, блокеры, следующая задача.
9. `DECISIONS.md`: ADR или ссылки на решения.
10. Собственный deployment config, health checks и базовая телеметрия.

## Общие принципы
- Все данные о времени в пути, ценах, свободных местах, шуме и безопасности должны иметь источник, дату и уровень неопределённости; не выдавать демо-данные за реальные.
- Геолокация — только по согласию, минимизация хранения, возможность удаления. Для встреч не показывать точные адреса участников без их согласия.
- Данные о финансах, здоровье и предпочтениях обрабатывать минимально, с учётом законодательства Казахстана и целевых рынков.
- Нельзя обещать гарантированную безопасность маршрута, доходность, доступность парковки или точную цену недвижимости.
- Монетизация и цены — гипотезы до интервью/пилотов.

## Открытые решения
Рабочее имя бренда; домен; языки (предложение: RU/KZ/EN); стартовый проект; провайдер карт (2ГИС/OSM/другие); бюджет API; auth и платежи; хостинг; политика данных.
