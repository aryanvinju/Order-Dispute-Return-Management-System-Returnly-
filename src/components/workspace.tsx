'use client';
import { useEffect, useState, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Layers3,
  LayoutDashboard,
  MessagesSquare,
  ShoppingBag,
  CreditCard,
  ChartNoAxesCombined,
  CircleHelp,
  LogOut,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  ChevronRight,
  ChevronLeft,
  X,
  Clock3,
  CheckCheck,
  CircleDot,
  Wallet,
  SlidersHorizontal,
  Download,
  Paperclip,
  Send,
  FileText,
  Package,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  Menu,
  Flag,
  Check,
  Headphones,
  Coffee,
  Backpack,
  LampDesk,
  Store,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  reasons,
  statusLabels,
  type User,
  type Overview,
  type Dispute,
  type Status,
  type Order,
  type Message,
  type Evidence,
  type AuditEvent,
} from '@/lib/types';
import { money } from '@/lib/domain';
const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'disputes', label: 'Disputes', icon: MessagesSquare },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'refunds', label: 'Refunds', icon: CreditCard },
  { id: 'insights', label: 'Insights', icon: ChartNoAxesCombined },
];
const date = (v: string) =>
  new Date(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const time = (v: string) =>
  new Date(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
const initials = (name: string) =>
  name
    .split(' ')
    .map((x) => x[0])
    .slice(0, 2)
    .join('');
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const form = body instanceof FormData;
  const r = await fetch(`/api/${path}`, {
    method,
    headers: form ? undefined : body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
    cache: 'no-store',
  });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401) location.assign('/login');
    throw Error(data.error || 'Something went wrong. Please try again.');
  }
  return data;
}
function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status-badge ${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  );
}
function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty">
      <span>
        <MessagesSquare size={29} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
function ProductIcon({ name }: { name: string }) {
  const Icon = /headphone|keyboard|dock/i.test(name)
    ? Headphones
    : /backpack|tote|pouch/i.test(name)
      ? Backpack
      : /coffee|ceramic|bottle/i.test(name)
        ? Coffee
        : LampDesk;
  return (
    <span className="product-icon">
      <Icon size={26} strokeWidth={1.5} />
    </span>
  );
}
function exportCSV(data: Overview) {
  const columns = [
    'Case',
    'Order',
    'Title',
    'Buyer',
    'Vendor',
    'Reason',
    'Status',
    'Requested INR',
    'Refund INR',
    'Created',
  ];
  const records = data.disputes.map((d) => [
    d.reference,
    d.order_reference,
    d.title,
    d.buyer_name,
    d.shop_name,
    reasons[d.reason],
    statusLabels[d.status],
    d.requested_cents / 100,
    d.refund_cents / 100,
    d.created_at,
  ]);
  const escape = (v: unknown) =>
    '"' +
    String(v)
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob(
      ['\ufeff' + [columns, ...records].map((row) => row.map(escape).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8;' },
    ),
  );
  a.download = 'returnly-disputes.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
type Detail = { dispute: Dispute; messages: Message[]; evidence: Evidence[]; events: AuditEvent[] };
export default function Workspace({
  user,
  view,
  caseId,
}: {
  user: User;
  view: string;
  caseId?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [creating, setCreating] = useState(false),
    [selectedOrder, setSelectedOrder] = useState(''),
    [mobile, setMobile] = useState(false),
    [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setError('');
    try {
      const next = await api<Overview>('overview');
      setData(next);
      if (caseId) setDetail(await api<Detail>(`disputes/${caseId}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load the workspace.');
    } finally {
      setLoading(false);
    }
  }, [caseId]);
  useEffect(() => {
    setDetail(null);
    setLoading(true);
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    setMobile(false);
  }, [view, caseId]);
  function notify(text: string) {
    setToast(text);
  }
  async function action(path: string, method: string, body?: unknown, message = 'Changes saved') {
    await api(path, method, body);
    await reload();
    notify(message);
  }
  const title = nav.find((n) => n.id === view)?.label || 'Help & guide';
  const startDispute = (id = '') => {
    setSelectedOrder(id);
    setCreating(true);
  };
  return (
    <div className="workspace">
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <Link className="brand" href="/app">
          <span className="brand-icon">
            <Layers3 size={22} />
          </span>
          returnly<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-tag">
          <span className="workspace-avatar">
            {user.role === 'vendor' ? <Store size={17} /> : <ShieldCheck size={17} />}
          </span>
          <div>
            <strong>
              {user.role === 'admin'
                ? 'Resolution center'
                : user.role === 'vendor'
                  ? user.shop_name
                  : 'Personal workspace'}
            </strong>
            <small>{user.role} workspace</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <Link
              key={n.id}
              href={`/app/${n.id}`}
              className={`nav-item ${view === n.id ? 'active' : ''}`}
              aria-current={view === n.id ? 'page' : undefined}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === 'disputes' && !!data?.stats.active && <b>{data.stats.active}</b>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link className={`nav-item ${view === 'guide' ? 'active' : ''}`} href="/app/guide">
            <CircleHelp size={19} />
            Help & guide
          </Link>
          <button
            className="user-card"
            onClick={async () => {
              await api('auth/logout', 'POST');
              router.push('/login');
              router.refresh();
            }}
            title="Sign out"
          >
            <span className="avatar">{initials(user.name)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.role} account</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
            {caseId && (
              <>
                <ChevronRight size={14} />
                <span>Case details</span>
              </>
            )}
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span />
              Demo environment
            </span>
            <span className="avatar small">{initials(user.name)}</span>
          </div>
        </header>
        <main>
          {error && (
            <div className="error-box page-error" role="alert">
              <AlertCircle size={19} />
              <span>{error}</span>
              <button onClick={() => void reload()}>Try again</button>
            </div>
          )}
          {loading && !data ? (
            <div className="loading">
              <RefreshCw className="spin" />
              <p>Loading…</p>
            </div>
          ) : data ? (
            <>
              {caseId ? (
                detail ? (
                  <CaseDetail
                    detail={detail}
                    user={user}
                    action={action}
                    reload={reload}
                    notify={notify}
                  />
                ) : !error ? (
                  <div className="loading">Loading case…</div>
                ) : null
              ) : view === 'overview' ? (
                <>
                  <PageHeading
                    eyebrow="THE BIG PICTURE"
                    title={
                      user.role === 'admin'
                        ? 'Admin dashboard'
                        : user.role === 'buyer'
                          ? 'Buyer dashboard'
                          : 'Vendor dashboard'
                    }
                    description={
                      user.role === 'admin'
                        ? 'Manage disputes and review refund decisions.'
                        : user.role === 'buyer'
                          ? 'View your orders, disputes and refund status.'
                          : 'View and respond to disputes for your shop.'
                    }
                  >
                    <button className="button secondary" onClick={() => exportCSV(data)}>
                      <Download size={16} />
                      Export report
                    </button>
                    {user.role === 'buyer' && (
                      <button className="button primary" onClick={() => startDispute()}>
                        <Plus size={17} />
                        Raise a dispute
                      </button>
                    )}
                  </PageHeading>
                  <Stats data={data} />
                  <div className="overview-grid">
                    <section className="panel">
                      <PanelHeader
                        title="Recent disputes"
                        description="The latest cases in your workspace."
                      >
                        <Link href="/app/disputes" className="text-link">
                          View all cases <ArrowRight size={15} />
                        </Link>
                      </PanelHeader>
                      <DisputeTable disputes={data.disputes.slice(0, 5)} compact />
                    </section>
                    <section className="panel health-panel">
                      <PanelHeader title="Resolution snapshot" description="Current case totals." />
                      <ResolutionChart data={data} />
                    </section>
                  </div>
                  <div className="bottom-grid">
                    <section className="panel">
                      <PanelHeader
                        title="High priority cases"
                        description="Active cases with a high priority flag."
                      />
                      {data.disputes.filter(
                        (d) =>
                          d.priority === 'high' && !['resolved', 'rejected'].includes(d.status),
                      ).length ? (
                        data.disputes
                          .filter(
                            (d) =>
                              d.priority === 'high' && !['resolved', 'rejected'].includes(d.status),
                          )
                          .slice(0, 3)
                          .map((d) => (
                            <Link
                              key={d.id}
                              className="attention-row"
                              href={`/app/disputes/${d.id}`}
                            >
                              <span className="attention-icon">
                                <Flag size={17} />
                              </span>
                              <div>
                                <strong>{d.title}</strong>
                                <small>
                                  {d.reference} · {d.shop_name}
                                </small>
                              </div>
                              <span className="age">
                                <Clock3 size={13} />
                                {d.age_hours}h open
                              </span>
                              <ChevronRight size={16} />
                            </Link>
                          ))
                      ) : (
                        <Empty
                          title="Nothing urgent"
                          description="High priority active cases will appear here."
                        />
                      )}
                    </section>
                  </div>
                </>
              ) : view === 'disputes' ? (
                <>
                  <PageHeading
                    eyebrow="EVERY CONVERSATION COUNTS"
                    title="Disputes"
                    description="Search disputes and check their current status."
                  >
                    <button className="button secondary" onClick={() => exportCSV(data)}>
                      <Download size={16} />
                      Export
                    </button>
                    {user.role === 'buyer' && (
                      <button className="button primary" onClick={() => startDispute()}>
                        <Plus size={17} />
                        Raise a dispute
                      </button>
                    )}
                  </PageHeading>
                  <DisputesPage disputes={data.disputes} />
                </>
              ) : view === 'orders' ? (
                <>
                  <PageHeading
                    eyebrow="WHERE IT ALL STARTS"
                    title="Orders"
                    description="Review order details and follow any related disputes."
                  />
                  <OrdersPage orders={data.orders} user={user} startDispute={startDispute} />
                </>
              ) : view === 'refunds' ? (
                <>
                  <PageHeading
                    eyebrow="THE NEXT STEP, MADE CLEAR"
                    title="Refunds"
                    description="Track approved refunds from decision to simulated completion."
                  />
                  <div className="info-banner">
                    <CreditCard size={20} />
                    <span>
                      Payments are simulated. Approving a refund reserves the amount; completing it
                      here simulates the payout.
                    </span>
                  </div>
                  <RefundsPage data={data} user={user} action={action} />
                </>
              ) : view === 'insights' ? (
                <>
                  <PageHeading
                    eyebrow="UNDERSTAND THE PATTERNS"
                    title="Workspace insights"
                    description="A closer look at the cases, causes, and outcomes that matter."
                  >
                    <button className="button secondary" onClick={() => exportCSV(data)}>
                      <Download size={16} />
                      Export data
                    </button>
                  </PageHeading>
                  <Stats data={data} />
                  <div className="insights-grid">
                    <section className="panel">
                      <PanelHeader
                        title="Why cases are raised"
                        description="Category counts from the MongoDB aggregation pipeline."
                      />
                      <div className="category-chart">
                        {Object.entries(reasons).map(([key, label]) => {
                          const count = data.categories.find((c) => c.reason === key)?.count || 0;
                          return (
                            <div className="category-row" key={key}>
                              <div>
                                <span>{label}</span>
                                <strong>{count}</strong>
                              </div>
                              <div className="bar-track">
                                <span
                                  style={{
                                    width: `${(count / Math.max(1, data.stats.total)) * 100}%`,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {!!data.syncPending && (
                        <div className="sync-note">Some category counts are still syncing.</div>
                      )}
                    </section>
                    <section className="panel">
                      <PanelHeader
                        title="Case outcomes"
                        description="Live totals from the MySQL dashboard view."
                      />
                      <ResolutionChart data={data} />
                    </section>
                  </div>
                  <section className="panel">
                    <PanelHeader
                      title="Refund summary"
                      description="Amounts reserved for approved refunds in this workspace."
                    />
                    <div className="summary-grid">
                      <div>
                        <span>Approved amount</span>
                        <strong>{money(data.stats.refunded)}</strong>
                      </div>
                      <div>
                        <span>Completed payouts</span>
                        <strong>
                          {money(
                            data.refunds
                              .filter((r) => r.status === 'completed')
                              .reduce((a, r) => a + r.amount_cents, 0),
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>Awaiting simulation</span>
                        <strong>
                          {data.refunds.filter((r) => r.status === 'pending').length} refunds
                        </strong>
                      </div>
                    </div>
                  </section>
                </>
              ) : view === 'guide' ? (
                <Guide user={user} />
              ) : (
                <Empty
                  title="Page not found"
                  description="Choose a page from the navigation to continue."
                />
              )}
              {!!data.syncPending && (
                <div className="sync-note">
                  <Clock3 size={15} />
                  {data.syncPending} update(s) waiting to sync to the conversation store.{' '}
                  {user.role === 'admin' && (
                    <button
                      onClick={async () => {
                        try {
                          await action('sync', 'POST', undefined, 'Sync completed');
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Retry sync
                    </button>
                  )}
                </div>
              )}
              <footer className="workspace-footer">
                <span>Order Dispute & Return Management System</span>
                <span>Returnly · Team 34</span>
              </footer>
            </>
          ) : (
            !loading && (
              <Empty
                title="Workspace unavailable"
                description="Check the database connection, then try again."
              />
            )
          )}
        </main>
      </div>
      {creating && data && (
        <CreateDispute
          orders={data.orders}
          selected={selectedOrder}
          close={() => setCreating(false)}
          created={(id) => {
            setCreating(false);
            notify('Your dispute is open. We’ll keep every update here.');
            router.push(`/app/disputes/${id}`);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function PanelHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
function Stats({ data }: { data: Overview }) {
  const cards: {
    label: string;
    value: string | number;
    caption: string;
    icon: LucideIcon;
    color: string;
  }[] = [
    {
      label: 'Total disputes',
      value: data.stats.total,
      caption: 'Every case, in one place',
      icon: MessagesSquare,
      color: 'purple',
    },
    {
      label: 'Active cases',
      value: data.stats.active,
      caption: 'Moving toward a resolution',
      icon: Clock3,
      color: 'amber',
    },
    {
      label: 'Closed cases',
      value: data.stats.resolved,
      caption: `${data.stats.total ? Math.round((data.stats.resolved / data.stats.total) * 100) : 0}% of all cases`,
      icon: CheckCheck,
      color: 'green',
    },
    {
      label: 'Approved refunds',
      value: money(data.stats.refunded),
      caption: 'Full and partial refunds',
      icon: Wallet,
      color: 'blue',
    },
  ];
  return (
    <div className="stats-grid">
      {cards.map((c) => (
        <div className="stat-card" key={c.label}>
          <div className="stat-top">
            <span>{c.label}</span>
            <span className={`stat-icon ${c.color}`}>
              <c.icon size={19} />
            </span>
          </div>
          <strong>{c.value}</strong>
          <small>{c.caption}</small>
        </div>
      ))}
    </div>
  );
}
function ResolutionChart({ data }: { data: Overview }) {
  const percentage = data.stats.total
    ? Math.round((data.stats.resolved / data.stats.total) * 100)
    : 0;
  return (
    <div className="resolution-chart">
      <div className="progress-heading">
        <span>Cases closed</span>
        <strong>{percentage}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${percentage}%` }} />
      </div>
      <div className="chart-legend">
        <span>
          Active cases <strong>{data.stats.active}</strong>
        </span>
        <span>
          Closed cases <strong>{data.stats.resolved}</strong>
        </span>
        <span>
          Average time to close <strong>{data.stats.averageHours} hours</strong>
        </span>
      </div>
    </div>
  );
}
function DisputeTable({ disputes, compact = false }: { disputes: Dispute[]; compact?: boolean }) {
  if (!disputes.length)
    return (
      <Empty
        title="No cases here yet"
        description="Disputes and their latest updates will appear here."
      />
    );
  return (
    <div className="table-scroll">
      <table className={`data-table ${compact ? 'compact' : ''}`}>
        <thead>
          <tr>
            <th>CASE / DETAILS</th>
            {!compact && <th>BUYER & VENDOR</th>}
            <th>STATUS</th>
            <th>REQUESTED</th>
            <th>
              <span className="sr-only">Open case</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {disputes.map((d) => (
            <tr key={d.id}>
              <td>
                <Link href={`/app/disputes/${d.id}`} className="case-link">
                  <span className="case-ref">
                    {d.reference}
                    {d.priority === 'high' && <Flag size={11} />}
                  </span>
                  <strong>{d.title}</strong>
                  <small>{reasons[d.reason]}</small>
                </Link>
              </td>
              {!compact && (
                <td>
                  <span className="cell-main">{d.buyer_name}</span>
                  <small>{d.shop_name}</small>
                </td>
              )}
              <td>
                <StatusBadge status={d.status} />
              </td>
              <td>
                <span className="amount">{money(d.requested_cents)}</span>
                <small>{date(d.created_at)}</small>
              </td>
              <td>
                <Link
                  className="table-arrow"
                  aria-label={`Open ${d.reference}`}
                  href={`/app/disputes/${d.id}`}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function DisputesPage({ disputes }: { disputes: Dispute[] }) {
  const [tab, setTab] = useState('all'),
    [search, setSearch] = useState(''),
    [reason, setReason] = useState('all'),
    [page, setPage] = useState(1);
  const filtered = disputes.filter(
    (d) =>
      (tab === 'all' ||
        (tab === 'active' && !['resolved', 'rejected'].includes(d.status)) ||
        (tab === 'closed' && ['resolved', 'rejected'].includes(d.status))) &&
      (reason === 'all' || d.reason === reason) &&
      `${d.reference} ${d.title} ${d.buyer_name} ${d.shop_name} ${d.order_reference}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 8)),
    safePage = Math.min(page, pages);
  return (
    <section className="panel">
      <div className="table-toolbar">
        <div className="tabs">
          {[
            ['all', 'All cases'],
            ['active', 'Active'],
            ['closed', 'Closed'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setPage(1);
              }}
              className={tab === id ? 'selected' : ''}
            >
              {label}
              {id === 'all' && <span>{disputes.length}</span>}
            </button>
          ))}
        </div>
        <div className="filters">
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Search cases"
              placeholder="Search cases…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="select-filter">
            <SlidersHorizontal size={15} />
            <select
              aria-label="Filter by reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All reasons</option>
              {Object.entries(reasons).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <DisputeTable disputes={filtered.slice((safePage - 1) * 8, safePage * 8)} />
      <div className="table-footer">
        <span>
          {filtered.length
            ? `${(safePage - 1) * 8 + 1}–${Math.min(safePage * 8, filtered.length)} of ${filtered.length} cases`
            : '0 cases'}
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="Previous page"
            disabled={safePage === 1}
            onClick={() => setPage(safePage - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            Page {safePage} of {pages}
          </span>
          <button
            className="icon-button"
            aria-label="Next page"
            disabled={safePage === pages}
            onClick={() => setPage(safePage + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
function OrdersPage({
  orders,
  user,
  startDispute,
}: {
  orders: Order[];
  user: User;
  startDispute: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = orders.filter((o) =>
    `${o.reference} ${o.items.map((i) => i.product_name).join(' ')} ${o.shop_name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <label className="search-field order-search">
        <Search size={17} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search orders or products…"
          aria-label="Search orders"
        />
      </label>
      <div className="orders-grid">
        {filtered.map((o) => (
          <section className="panel order-card" key={o.id}>
            <div className="order-card-head">
              <span>{o.reference}</span>
              <span className={`order-status ${o.status}`}>{o.status}</span>
            </div>
            {o.items.map((i, n) => (
              <div className="product-row" key={n}>
                <ProductIcon name={i.product_name} />
                <div>
                  <small>{i.category}</small>
                  <h3>{i.product_name}</h3>
                  <p>
                    Quantity {i.quantity} · {o.shop_name}
                  </p>
                </div>
              </div>
            ))}
            <div className="order-meta">
              <span>Ordered {date(o.created_at)}</span>
              <strong>{money(o.total_cents)}</strong>
            </div>
            <div className="order-card-footer">
              <span>{user.role === 'buyer' ? 'Simulated payment' : o.buyer_name}</span>
              {o.dispute_id ? (
                <Link href={`/app/disputes/${o.dispute_id}`} className="text-link">
                  View dispute <ArrowUpRight size={15} />
                </Link>
              ) : user.role === 'buyer' && o.status !== 'cancelled' ? (
                <button className="text-link" onClick={() => startDispute(o.id)}>
                  Report an issue <ArrowUpRight size={15} />
                </button>
              ) : (
                <span className="muted">No dispute</span>
              )}
            </div>
          </section>
        ))}
      </div>
      {!filtered.length && <Empty title="No orders found" description="Try a different search." />}
    </>
  );
}
function RefundsPage({
  data,
  user,
  action,
}: {
  data: Overview;
  user: User;
  action: (p: string, m: string, b?: unknown, n?: string) => Promise<void>;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  return (
    <section className="panel">
      <PanelHeader
        title="Refund activity"
        description={`${data.refunds.length} approved refunds · ${money(data.stats.refunded)} total`}
      />
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {data.refunds.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>REFUND / CASE</th>
                <th>BUYER</th>
                <th>AMOUNT</th>
                <th>STATUS</th>
                <th>PROCESSING</th>
              </tr>
            </thead>
            <tbody>
              {data.refunds.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="cell-main">{r.reference}</span>
                    <Link className="text-link" href={`/app/disputes/${r.dispute_id}`}>
                      {r.dispute_reference} <ArrowUpRight size={13} />
                    </Link>
                  </td>
                  <td>
                    <span className="cell-main">{r.buyer_name}</span>
                    <small>{r.shop_name}</small>
                  </td>
                  <td>
                    <strong className="amount">{money(r.amount_cents)}</strong>
                    <small>{date(r.created_at)}</small>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${r.status === 'completed' ? 'resolved' : 'awaiting_vendor'}`}
                    >
                      <span />
                      {r.status === 'completed' ? 'Completed' : 'Pending'}
                    </span>
                  </td>
                  <td>
                    {r.status === 'pending' && user.role === 'admin' ? (
                      <button
                        className="button secondary small-button"
                        disabled={busy === r.id}
                        onClick={async () => {
                          setBusy(r.id);
                          setError('');
                          try {
                            await action(
                              `refunds/${r.id}/complete`,
                              'POST',
                              undefined,
                              'Simulated refund completed',
                            );
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy('');
                          }
                        }}
                      >
                        {busy === r.id ? 'Processing…' : 'Simulate payout'}
                      </button>
                    ) : (
                      <small>{r.completed_at ? time(r.completed_at) : 'Awaiting processing'}</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No refunds yet"
          description="Approved refunds will appear here once an admin resolves a case."
        />
      )}
    </section>
  );
}
function CreateDispute({
  orders,
  selected,
  close,
  created,
}: {
  orders: Order[];
  selected: string;
  close: () => void;
  created: (id: string) => void;
}) {
  const available = orders.filter((o) => !o.dispute_id && o.status !== 'cancelled');
  const initial = available.find((o) => o.id === selected) || available[0];
  const [orderId, setOrderId] = useState(initial?.id || ''),
    [title, setTitle] = useState(''),
    [reason, setReason] = useState('damaged'),
    [description, setDescription] = useState(''),
    [amount, setAmount] = useState(initial ? String(initial.total_cents / 100) : ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const order = available.find((o) => o.id === orderId);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close();
    };
    document.addEventListener('keydown', key);
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = original;
    };
  }, [busy, close]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api<{ id: string }>('disputes', 'POST', {
        orderId,
        title,
        reason,
        description,
        requestedCents: Math.round(Number(amount) * 100),
      });
      created(d.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="new-case-title" className="modal">
        <div className="modal-heading">
          <div>
            <div className="eyebrow">LET’S MAKE IT RIGHT</div>
            <h2 id="new-case-title">Raise a dispute</h2>
          </div>
          <button className="icon-button" aria-label="Close dialog" disabled={busy} onClick={close}>
            <X size={21} />
          </button>
        </div>
        {!available.length ? (
          <>
            <Empty
              title="All caught up"
              description="There are no eligible orders without an existing dispute. You can follow your current cases from the Disputes page."
            />
            <button className="button secondary" onClick={close}>
              Back to workspace
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="muted modal-intro">
              Tell us what happened. You can add evidence and follow the conversation after opening
              your case.
            </p>
            <label>
              Order
              <select
                autoFocus
                value={orderId}
                onChange={(e) => {
                  setOrderId(e.target.value);
                  const o = available.find((o) => o.id === e.target.value);
                  setAmount(String((o?.total_cents || 0) / 100));
                }}
                required
              >
                {available.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.reference} · {o.items[0]?.product_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-two">
              <label>
                What went wrong?
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {Object.entries(reasons).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Requested refund (INR)
                <input
                  type="number"
                  min="0.01"
                  max={(order?.total_cents || 0) / 100}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </label>
            </div>
            <label>
              A short title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                minLength={8}
                maxLength={140}
                placeholder="e.g. The item arrived with a broken screen"
                required
              />
            </label>
            <label>
              Tell us more
              <textarea
                rows={4}
                minLength={20}
                maxLength={5000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue and the outcome you’re hoping for…"
                required
              />
            </label>
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            <div className="modal-footer">
              <button type="button" className="button secondary" disabled={busy} onClick={close}>
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? 'Opening case…' : 'Open dispute'}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
function CaseDetail({
  detail,
  user,
  action,
  reload,
  notify,
}: {
  detail: Detail;
  user: User;
  action: (p: string, m: string, b?: unknown, n?: string) => Promise<void>;
  reload: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const d = detail.dispute,
    closed = ['resolved', 'rejected'].includes(d.status);
  const [body, setBody] = useState(''),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [decision, setDecision] = useState('approve'),
    [amount, setAmount] = useState(String(d.requested_cents / 100)),
    [note, setNote] = useState(''),
    [confirm, setConfirm] = useState(false),
    [tab, setTab] = useState('conversation');
  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <Link href="/app/disputes" className="back-link">
        <ChevronLeft size={16} />
        All disputes
      </Link>
      <div className="case-heading">
        <div>
          <div className="case-heading-ref">
            <span>{d.reference}</span>
            <StatusBadge status={d.status} />
            {d.priority === 'high' && (
              <span className="priority-label">
                <Flag size={12} />
                High priority
              </span>
            )}
          </div>
          <h1>{d.title}</h1>
          <p>
            Opened {date(d.created_at)} <span>·</span> {reasons[d.reason]}
          </p>
        </div>
        {user.role === 'admin' && !closed && (
          <button
            className="button secondary"
            disabled={!!busy}
            onClick={() =>
              void run('priority', () =>
                action(
                  `disputes/${d.id}`,
                  'PATCH',
                  { priority: d.priority === 'high' ? 'normal' : 'high' },
                  'Priority updated',
                ),
              )
            }
          >
            <Flag size={15} />
            {d.priority === 'high' ? 'Remove priority' : 'Mark high priority'}
          </button>
        )}
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {closed && (
        <div className={`resolution-banner ${d.status === 'rejected' ? 'declined' : ''}`}>
          <CheckCircle2 size={22} />
          <div>
            <strong>
              {d.status === 'resolved'
                ? `Refund approved · ${money(d.refund_cents)}`
                : 'Case reviewed and declined'}
            </strong>
            <p>{d.resolution_note}</p>
            <small>
              {d.resolved_at && time(d.resolved_at)}
              {d.refund_status && ` · Refund ${d.refund_status}`}
            </small>
          </div>
        </div>
      )}
      <div className="case-grid">
        <div className="case-main">
          <section className="panel">
            <PanelHeader title="The buyer’s concern" />
            <p className="case-description">{d.description}</p>
          </section>
          <section className="panel conversation-panel">
            <div className="tabs case-tabs">
              <button
                className={tab === 'conversation' ? 'selected' : ''}
                onClick={() => setTab('conversation')}
              >
                Conversation <span>{detail.messages.length}</span>
              </button>
              <button
                className={tab === 'timeline' ? 'selected' : ''}
                onClick={() => setTab('timeline')}
              >
                Activity timeline
              </button>
            </div>
            {tab === 'conversation' ? (
              <>
                <div className="conversation-notice">
                  <ShieldCheck size={15} />A shared thread for the buyer, vendor, and resolution
                  team.
                </div>
                <div className="messages">
                  {!detail.messages.length ? (
                    <Empty
                      title="Start with a conversation"
                      description="Ask a question or share an update to help move this case forward."
                    />
                  ) : (
                    detail.messages.map((m) => (
                      <article
                        key={m._id}
                        className={`message ${m.authorId === user.id ? 'own' : ''}`}
                      >
                        <span className={`avatar ${m.role === 'admin' ? 'admin-avatar' : ''}`}>
                          {initials(m.authorName)}
                        </span>
                        <div>
                          <div className="message-meta">
                            <strong>{m.authorName}</strong>
                            <span>{m.role}</span>
                            <time>{time(m.createdAt)}</time>
                          </div>
                          <p>{m.body}</p>
                        </div>
                      </article>
                    ))
                  )}
                </div>
                {!closed ? (
                  <form
                    className="message-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run('message', async () => {
                        await action(
                          `disputes/${d.id}/messages`,
                          'POST',
                          { body },
                          'Message saved',
                        );
                        setBody('');
                      });
                    }}
                  >
                    <label className="sr-only" htmlFor="message-body">
                      Your message
                    </label>
                    <textarea
                      id="message-body"
                      placeholder="Write a thoughtful reply…"
                      rows={3}
                      value={body}
                      maxLength={4000}
                      onChange={(e) => setBody(e.target.value)}
                      required
                    />
                    <div>
                      <span>Messages are stored as a thread. Refresh to see new replies.</span>
                      <button
                        className="button primary small-button"
                        disabled={!!busy || !body.trim()}
                      >
                        {busy === 'message' ? 'Sending…' : 'Send reply'}
                        <Send size={14} />
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="closed-thread">
                    <Check size={15} />
                    This case is closed. The conversation is saved for your records.
                  </div>
                )}
              </>
            ) : (
              <div className="timeline">
                {detail.events.map((e) => (
                  <div className="timeline-row" key={e.id}>
                    <i />
                    <div>
                      <strong>
                        {(
                          {
                            dispute_opened: 'Dispute opened',
                            message_sent: 'Message added',
                            case_updated: 'Case details updated',
                            refund_approved: 'Refund approved',
                            dispute_declined: 'Dispute declined',
                            refund_completed: 'Simulated refund completed',
                            evidence_uploaded: 'Evidence uploaded',
                          } as Record<string, string>
                        )[e.event_type] || e.event_type}
                      </strong>
                      <p>
                        {e.actor_name} · {time(e.created_at)}
                      </p>
                      {Boolean(e.detail?.note) && <small>{String(e.detail.note)}</small>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="panel">
            <PanelHeader
              title="Supporting evidence"
              description="PNG, JPG or PDF · up to 5 MB each · 10 files per case"
            >
              {!closed && (
                <label
                  className={`button secondary small-button upload-label ${busy ? 'disabled' : ''}`}
                >
                  <Paperclip size={15} />
                  {busy === 'upload' ? 'Uploading…' : 'Add evidence'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    disabled={!!busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void run('upload', async () => {
                          const form = new FormData();
                          form.append('file', file);
                          await api(`disputes/${d.id}/evidence`, 'POST', form);
                          await reload();
                          notify('Evidence added');
                        });
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </PanelHeader>
            <div className="evidence-list">
              {detail.evidence.length ? (
                detail.evidence.map((e) => (
                  <a className="evidence-file" href={`/api/evidence/${e._id}`} key={e._id}>
                    <span>
                      <FileText size={23} />
                    </span>
                    <div>
                      <strong>{e.filename}</strong>
                      <small>
                        {Math.ceil(e.size / 1024)} KB · {e.uploaderName}
                      </small>
                    </div>
                    <Download size={16} />
                  </a>
                ))
              ) : (
                <p className="muted">
                  No evidence added yet. Clear photos and documents help tell the full story.
                </p>
              )}
            </div>
          </section>
        </div>
        <aside className="case-aside">
          <section className="panel">
            <PanelHeader title="Case at a glance" />
            <dl className="case-facts">
              <div>
                <dt>Order reference</dt>
                <dd>{d.order_reference}</dd>
              </div>
              <div>
                <dt>Buyer</dt>
                <dd>{d.buyer_name}</dd>
              </div>
              <div>
                <dt>Vendor</dt>
                <dd>{d.shop_name}</dd>
              </div>
              <div>
                <dt>Order total</dt>
                <dd>{money(d.total_cents)}</dd>
              </div>
              <div className="requested">
                <dt>Requested refund</dt>
                <dd>{money(d.requested_cents)}</dd>
              </div>
            </dl>
          </section>
          {user.role === 'admin' && !closed && (
            <section className="panel decision-panel">
              <PanelHeader
                title="Move the case forward"
                description="Review both sides before deciding."
              />
              <div className="decision-content">
                <label>
                  Review status
                  <select
                    value={d.status}
                    disabled={!!busy}
                    onChange={(e) =>
                      void run('status', () =>
                        action(
                          `disputes/${d.id}`,
                          'PATCH',
                          { status: e.target.value },
                          'Review status updated',
                        ),
                      )
                    }
                  >
                    {d.status === 'open' && <option value="open">Open</option>}
                    <option value="awaiting_vendor">Awaiting vendor</option>
                    <option value="under_review">Under review</option>
                  </select>
                </label>
                <div className="decision-divider" />
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setConfirm(true);
                  }}
                >
                  <label>
                    Decision
                    <select
                      value={decision}
                      onChange={(e) => {
                        setDecision(e.target.value);
                        setConfirm(false);
                      }}
                    >
                      <option value="approve">Approve refund</option>
                      <option value="reject">Decline dispute</option>
                    </select>
                  </label>
                  {decision === 'approve' && (
                    <label>
                      Refund amount (INR)
                      <input
                        type="number"
                        min="0.01"
                        max={d.requested_cents / 100}
                        step="0.01"
                        required
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value);
                          setConfirm(false);
                        }}
                      />
                      <small className="field-hint">
                        Full or partial, up to {money(d.requested_cents)}.
                      </small>
                    </label>
                  )}
                  <label>
                    Reason for your decision
                    <textarea
                      rows={4}
                      required
                      minLength={10}
                      maxLength={2000}
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value);
                        setConfirm(false);
                      }}
                      placeholder="Explain the outcome for both parties…"
                    />
                  </label>
                  {!confirm ? (
                    <button className="button primary full-width" disabled={!!busy}>
                      Review decision <ArrowRight size={15} />
                    </button>
                  ) : (
                    <div className="confirm-decision">
                      <p>
                        {decision === 'approve'
                          ? `Approve ${money(Math.round(Number(amount) * 100))} and close this case?`
                          : 'Decline the dispute and close this case?'}
                      </p>
                      <button
                        type="button"
                        className="button primary full-width"
                        disabled={!!busy}
                        onClick={() =>
                          void run('resolve', async () => {
                            await action(
                              `disputes/${d.id}/resolve`,
                              'POST',
                              {
                                decision,
                                amountCents:
                                  decision === 'approve' ? Math.round(Number(amount) * 100) : 0,
                                note,
                              },
                              'Decision recorded',
                            );
                            setConfirm(false);
                          })
                        }
                      >
                        {busy === 'resolve' ? 'Saving…' : 'Confirm decision'}
                        <Check size={15} />
                      </button>
                      <button className="text-link" type="button" onClick={() => setConfirm(false)}>
                        Keep reviewing
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </section>
          )}
          {user.role !== 'admin' && !closed && (
            <div className="case-tip">
              <ShieldCheck size={23} />
              <strong>{user.role === 'buyer' ? 'Buyer information' : 'Vendor information'}</strong>
              <p>
                {user.role === 'buyer'
                  ? 'Share clear details and evidence. The vendor can respond, and an admin will review both sides before deciding.'
                  : 'Share your perspective and supporting details. An admin will review the conversation before resolving the case.'}
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
function Guide({ user }: { user: User }) {
  return (
    <>
      <PageHeading
        eyebrow="A CLEARER WAY FORWARD"
        title="User guide"
        description="Steps for buyers, vendors and admins."
      />
      <div className="guide-grid">
        {[
          {
            step: '01',
            icon: ShoppingBag,
            title: 'Start with an order',
            body: 'Buyers choose an order, describe what went wrong, and request a full or partial refund. Each order has one case to keep the complete history together.',
          },
          {
            step: '02',
            icon: MessagesSquare,
            title: 'Bring both sides together',
            body: 'Buyers and vendors share messages and upload evidence. The conversation is stored as a thread. Refresh the page to see new replies.',
          },
          {
            step: '03',
            icon: ShieldCheck,
            title: 'Reach a fair decision',
            body: 'An admin reviews the order, conversation, and evidence, then approves a full or partial refund or declines the dispute with a written explanation.',
          },
          {
            step: '04',
            icon: CreditCard,
            title: 'Follow the refund',
            body: 'An approved amount is reserved immediately. An admin can simulate the payout from the Refunds page. No real money moves.',
          },
        ].map((c) => (
          <section className="panel guide-card" key={c.step}>
            <div>
              <span className="guide-icon">
                <c.icon size={25} />
              </span>
              <span>{c.step}</span>
            </div>
            <h2>{c.title}</h2>
            <p>{c.body}</p>
          </section>
        ))}
      </div>
      <section className="panel">
        <PanelHeader
          title={`Your ${user.role} workspace`}
          description="Everything you need for your part of the process."
        />
        <div className="guide-content">
          <p>
            {user.role === 'buyer'
              ? 'Use Orders to report an issue, Disputes to share details, and Refunds to check approved payouts.'
              : user.role === 'vendor'
                ? 'Open Disputes to see cases involving your shop. Your reply moves the case into admin review. You can add evidence before a case closes.'
                : 'Use the dispute queue to prioritize cases, request vendor responses, and record decisions. The Refunds page lets you complete simulated payouts, while Insights shows trends.'}
          </p>
          <div className="info-banner">
            <AlertCircle size={19} />
            <span>
              This project simulates payment processing. Shipment tracking and real-time chat are
              outside its scope.
            </span>
          </div>
        </div>
      </section>
      <section className="team-note">
        <Layers3 size={22} />
        <div>
          <strong>Order Dispute & Return Management System</strong>
          <p>Team 34 · Aditya Shetty (PES1UG24AM018) & Aryan Vinju (PES1UG24AM056)</p>
          <small>Next.js · MySQL · MongoDB</small>
        </div>
      </section>
    </>
  );
}
