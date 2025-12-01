import React from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { DroneCenterProvider, useDroneCenter } from './DroneCenterContext';
import './droneCenter.css';

const navItems = [
  { path: '/drone-center/dashboard', label: 'Dashboard' },
  { path: '/drone-center/drones', label: 'Drones' },
  { path: '/drone-center/hubs', label: 'Hubs' },
  { path: '/drone-center/assign', label: 'Assign Orders' },
  { path: '/drone-center/map', label: 'Realtime Map' },
  { path: '/drone-center/maintenance', label: 'Maintenance' },
  { path: '/drone-center/simulator', label: 'Simulator' },
];

const Header = () => {
  const { socketStatus, stats } = useDroneCenter();
  const statusLabel =
    socketStatus === 'connected'
      ? 'Socket connected'
      : socketStatus === 'error'
      ? 'Socket error'
      : socketStatus === 'disconnected'
      ? 'Socket disconnected'
      : 'Socket idle';

  return (
    <div className="drone-page-header">
      <div>
        <h1>Drone Center</h1>
        <div className="text-muted">Realtime control room for drone delivery</div>
      </div>
      <div className="chip-row">
        <div className="legend-item">
          <span className={`status-dot ${socketStatus}`} />
          {statusLabel}
        </div>
        <div className="legend-item">
          <strong>{stats?.totals?.total ?? 0}</strong> total drones
        </div>
        <Link to="/super-admin/drone-orders" className="btn primary" style={{ textDecoration: 'none' }}>
          Open Drone Orders
        </Link>
      </div>
    </div>
  );
};

const LayoutShell = () => (
  <div className="drone-center-shell">
    <nav className="drone-center-nav">
      <div className="drone-nav-title">🛰️ Drone Center</div>
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => `drone-nav-link${isActive ? ' active' : ''}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
    <div className="drone-center-main">
      <Header />
      <Outlet />
    </div>
  </div>
);

const DroneCenterLayout = () => (
  <DroneCenterProvider>
    <LayoutShell />
  </DroneCenterProvider>
);

export default DroneCenterLayout;
