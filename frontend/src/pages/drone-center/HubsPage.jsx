import React, { useMemo, useState } from 'react';
import { useDroneCenter } from './DroneCenterContext';

const emptyForm = {
  name: '',
  lat: '',
  lng: '',
  radiusKm: 5,
};

const HubsPage = () => {
  const { hubs, drones, createHub, updateHub, deleteHub } = useDroneCenter();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [feedback, setFeedback] = useState('');

  const dronesByHub = useMemo(() => {
    const map = {};
    drones.forEach((drone) => {
      if (!map[drone.hubId]) map[drone.hubId] = 0;
      map[drone.hubId] += 1;
    });
    return map;
  }, [drones]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      location: {
        lat: Number(form.lat),
        lng: Number(form.lng),
      },
      radiusKm: Number(form.radiusKm),
      id: editing?.id,
    };
    if (!payload.name || Number.isNaN(payload.location.lat) || Number.isNaN(payload.location.lng)) {
      setFeedback('Vui lòng nhập đầy đủ tên và tọa độ.');
      return;
    }

    if (editing) {
      const res = await updateHub(editing.id, payload);
      setFeedback(res.ok ? 'Đã cập nhật hub.' : res.error);
    } else {
      const res = await createHub(payload);
      setFeedback(res.ok ? 'Đã tạo hub mới.' : res.error);
    }

    setEditing(null);
    setForm(emptyForm);
  };

  const handleEdit = (hub) => {
    setEditing(hub);
    setForm({
      name: hub.name || '',
      lat: hub.location?.lat ?? '',
      lng: hub.location?.lng ?? '',
      radiusKm: hub.radiusKm ?? '',
    });
    setFeedback('');
  };

  const handleDelete = async (hub) => {
    const res = await deleteHub(hub.id);
    setFeedback(res.ok ? 'Đã xóa hub khỏi danh sách.' : res.error);
  };

  return (
    <>
      <div className="panel">
        <div className="flex between">
          <h2>Danh sách Hub</h2>
          {feedback && <span className="badge">{feedback}</span>}
        </div>
        <div className="table-wrap">
          <table className="drone-table">
            <thead>
              <tr>
                <th>Hub</th>
                <th>Vị trí</th>
                <th>Bán kính phục vụ</th>
                <th>Số Drone</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {hubs.map((hub) => (
                <tr key={hub.id || hub.name}>
                  <td>{hub.name}</td>
                  <td>
                    {hub.location?.lat?.toFixed ? hub.location.lat.toFixed(4) : hub.location?.lat || '--'},
                    {hub.location?.lng?.toFixed ? ` ${hub.location.lng.toFixed(4)}` : ` ${hub.location?.lng || ''}`}
                  </td>
                  <td>{hub.radiusKm} km</td>
                  <td>{dronesByHub[hub.id] || 0}</td>
                  <td className="flex" style={{ gap: 6 }}>
                    <button className="btn ghost" onClick={() => handleEdit(hub)}>
                      Edit
                    </button>
                    <button className="btn text" onClick={() => handleDelete(hub)}>
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
              {hubs.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted">
                    Chưa có hub nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="flex between">
          <h3>{editing ? 'Chỉnh sửa Hub' : 'Thêm Hub mới'}</h3>
          {editing && (
            <button
              className="btn text"
              onClick={() => {
                setEditing(null);
                setForm(emptyForm);
              }}
            >
              Hủy
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>Tên Hub</label>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="VD: HCM Central Hub"
              />
            </div>
            <div className="form-field">
              <label>Latitude</label>
              <input
                value={form.lat}
                onChange={(e) => setForm((prev) => ({ ...prev, lat: e.target.value }))}
                placeholder="10.7626"
                type="number"
                step="0.0001"
              />
            </div>
            <div className="form-field">
              <label>Longitude</label>
              <input
                value={form.lng}
                onChange={(e) => setForm((prev) => ({ ...prev, lng: e.target.value }))}
                placeholder="106.6602"
                type="number"
                step="0.0001"
              />
            </div>
            <div className="form-field">
              <label>Bán kính phục vụ (km)</label>
              <input
                value={form.radiusKm}
                onChange={(e) => setForm((prev) => ({ ...prev, radiusKm: e.target.value }))}
                type="number"
                step="0.1"
              />
            </div>
          </div>
          <button className="btn primary" type="submit">
            {editing ? 'Cập nhật Hub' : 'Thêm Hub'}
          </button>
        </form>
      </div>
    </>
  );
};

export default HubsPage;

