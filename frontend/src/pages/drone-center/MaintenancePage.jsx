import React, { useEffect, useMemo, useState } from 'react';
import { useDroneCenter } from './DroneCenterContext';

const MaintenancePage = () => {
  const { drones, addMaintenanceLog, refreshDrones } = useDroneCenter();
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'PERIODIC_CHECK',
    note: '',
    technician: '',
    nextMaintenanceDueAt: '',
    maintenanceStatus: 'IN_SERVICE',
  });
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!selectedId && drones.length) {
      setSelectedId(drones[0].droneId);
    }
  }, [drones, selectedId]);

  const selected = useMemo(
    () => drones.find((drone) => drone.droneId === selectedId) || drones[0],
    [drones, selectedId]
  );

  const logs = useMemo(() => selected?.maintenanceLogs || [], [selected]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selected?.droneId) return;
    const entry = {
      date: new Date(form.date),
      type: form.type,
      note: form.note,
      technician: form.technician,
      nextMaintenanceDueAt: form.nextMaintenanceDueAt ? new Date(form.nextMaintenanceDueAt) : undefined,
    };
    const res = await addMaintenanceLog(selected.droneId, entry, form.maintenanceStatus);
    if (res.ok) {
      setFeedback('Đã lưu log bảo trì.');
      setForm((prev) => ({ ...prev, note: '', technician: '' }));
      refreshDrones();
    } else {
      setFeedback(res.error || 'Không thể lưu log.');
    }
  };

  return (
    <>
      <div className="panel">
        <div className="flex between">
          <h2>Quản lý bảo trì drone</h2>
          <span className="badge">{drones.length} drone</span>
        </div>
        <div className="table-wrap">
          <table className="drone-table">
            <thead>
              <tr>
                <th>Drone</th>
                <th>Trạng thái</th>
                <th>Pin</th>
                <th>Hub</th>
                <th>Maintenance</th>
                <th>Chọn</th>
              </tr>
            </thead>
            <tbody>
              {drones.map((drone) => (
                <tr key={drone.droneId} className={drone.droneId === selected?.droneId ? 'active' : ''}>
                  <td>
                    <div>{drone.name}</div>
                    <div className="text-muted">{drone.droneId}</div>
                  </td>
                  <td>
                    <span className="pill ghost">{drone.status || '—'}</span>
                  </td>
                  <td>
                    <span className={`pill ${drone.battery < 30 ? 'low' : 'flying'}`}>🔋 {drone.battery ?? '--'}%</span>
                  </td>
                  <td>{drone.hubId || '—'}</td>
                  <td>
                    <div className="text-muted">{drone.maintenanceStatus || 'OK'}</div>
                    {drone.nextMaintenanceDueAt && (
                      <div className="mono" style={{ fontSize: 12 }}>
                        Next: {new Date(drone.nextMaintenanceDueAt).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td>
                    <button className="btn ghost" onClick={() => setSelectedId(drone.droneId)}>
                      Chọn
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="panel">
          <div className="flex between">
            <div>
              <h3>
                {selected.name} <span className="text-muted">{selected.droneId}</span>
              </h3>
              <div className="chip-row" style={{ gap: 8 }}>
                <span className="pill ghost">Status: {selected.status}</span>
                <span className="pill ghost">Maintenance: {selected.maintenanceStatus || 'OK'}</span>
              </div>
            </div>
            {feedback && <span className="badge">{feedback}</span>}
          </div>

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.2fr)' }}>
            <form onSubmit={handleSubmit} className="card glass" style={{ padding: 12 }}>
              <h4>Thêm log bảo trì</h4>
              <div className="form-field">
                <label>Ngày</label>
                <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Loại</label>
                <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                  <option value="PERIODIC_CHECK">PERIODIC_CHECK</option>
                  <option value="REPAIR">REPAIR</option>
                  <option value="FIRMWARE_UPDATE">FIRMWARE_UPDATE</option>
                  <option value="BATTERY_SWAP">BATTERY_SWAP</option>
                </select>
              </div>
              <div className="form-field">
                <label>Kỹ thuật viên</label>
                <input value={form.technician} onChange={(e) => setForm((p) => ({ ...p, technician: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Ghi chú</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                  placeholder="Mô tả ngắn gọn"
                />
              </div>
              <div className="form-field">
                <label>Next maintenance due</label>
                <input
                  type="date"
                  value={form.nextMaintenanceDueAt}
                  onChange={(e) => setForm((p) => ({ ...p, nextMaintenanceDueAt: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label>Trạng thái bảo trì</label>
                <select
                  value={form.maintenanceStatus}
                  onChange={(e) => setForm((p) => ({ ...p, maintenanceStatus: e.target.value }))}
                >
                  <option value="OK">OK</option>
                  <option value="NEEDS_CHECK">NEEDS_CHECK</option>
                  <option value="IN_SERVICE">IN_SERVICE</option>
                </select>
              </div>
              <button className="btn primary" type="submit">
                Lưu
              </button>
            </form>

            <div className="card glass" style={{ padding: 12 }}>
              <h4>Maintenance logs</h4>
              {logs.length === 0 ? (
                <div className="text-muted">Chưa có log bảo trì.</div>
              ) : (
                <ul className="timeline">
                  {logs.map((log, idx) => (
                    <li key={idx} className="timeline-item">
                      <div className="flex between">
                        <strong>{log.type}</strong>
                        <span className="text-muted">
                          {log.date ? new Date(log.date).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <div className="text-muted">{log.note}</div>
                      <div className="mono" style={{ fontSize: 12 }}>
                        {log.technician || '—'}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MaintenancePage;
