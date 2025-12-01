import React, { useMemo, useState } from 'react';
import DroneMapCanvas from './components/DroneMapCanvas';
import { useDroneCenter } from './DroneCenterContext';

const emptyForm = {
  name: '',
  code: '',
  street: '',
  ward: '',
  district: '',
  city: '',
  fullAddress: '',
  lat: '',
  lng: '',
  radiusKm: 5,
  isActive: true,
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
      code: form.code.trim().toUpperCase(),
      address: {
        street: form.street.trim(),
        ward: form.ward.trim(),
        district: form.district.trim(),
        city: form.city.trim(),
        fullAddress:
          form.fullAddress.trim() ||
          [form.street, form.ward, form.district, form.city].filter(Boolean).join(', '),
        location:
          form.lat && form.lng
            ? { coordinates: [Number(form.lng), Number(form.lat)] }
            : undefined,
      },
      radiusKm: Number(form.radiusKm),
      isActive: form.isActive,
    };

    if (!payload.name || !payload.code || !payload.address.fullAddress) {
      setFeedback('Vui lòng nhập đầy đủ tên, mã và địa chỉ.');
      return;
    }

    let res;
    if (editing) {
      res = await updateHub(editing.id, payload);
    } else {
      res = await createHub(payload);
    }
    setFeedback(res.ok ? 'Đã lưu hub.' : res.error);
    if (res.ok) {
      setEditing(null);
      setForm(emptyForm);
    }
  };

  const handleEdit = (hub) => {
    setEditing(hub);
    setForm({
      name: hub.name || '',
      code: hub.code || '',
      street: hub.address?.street || '',
      ward: hub.address?.ward || '',
      district: hub.address?.district || '',
      city: hub.address?.city || '',
      fullAddress: hub.address?.fullAddress || '',
      lat: hub.address?.location?.coordinates?.[1] ?? hub.location?.lat ?? '',
      lng: hub.address?.location?.coordinates?.[0] ?? hub.location?.lng ?? '',
      radiusKm: hub.radiusKm ?? '',
      isActive: typeof hub.isActive === 'boolean' ? hub.isActive : true,
    });
    setFeedback('');
  };

  const handleDelete = async (hub) => {
    const res = await deleteHub(hub.id);
    setFeedback(res.ok ? 'Đã xóa hub khỏi danh sách.' : res.error);
  };

  const previewPoints = useMemo(() => {
    const result = [];
    if (form.lat && form.lng) {
      result.push({ lat: Number(form.lat), lng: Number(form.lng), type: 'hub', label: form.name || 'Hub mới' });
    }
    return result;
  }, [form.lat, form.lng, form.name]);

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
                <th>Code</th>
                <th>Địa chỉ</th>
                <th>Phạm vi</th>
                <th>Drones</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hubs.map((hub) => (
                <tr key={hub.id || hub.code || hub.name}>
                  <td>{hub.name}</td>
                  <td className="mono">{hub.code}</td>
                  <td>
                    <div>{hub.address?.fullAddress || '—'}</div>
                    <div className="text-muted mono" style={{ fontSize: 12 }}>
                      {hub.location?.lat?.toFixed?.(4)}, {hub.location?.lng?.toFixed?.(4)}
                    </div>
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
                  <td colSpan={6} className="text-muted">
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
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div className="form-field">
              <label>Tên Hub</label>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="VD: HCM Central Hub"
              />
            </div>
            <div className="form-field">
              <label>Mã Hub</label>
              <input
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                placeholder="HCM1"
              />
            </div>
            <div className="form-field">
              <label>Street</label>
              <input value={form.street} onChange={(e) => setForm((p) => ({ ...p, street: e.target.value }))} />
            </div>
            <div className="form-field">
              <label>Ward</label>
              <input value={form.ward} onChange={(e) => setForm((p) => ({ ...p, ward: e.target.value }))} />
            </div>
            <div className="form-field">
              <label>District</label>
              <input value={form.district} onChange={(e) => setForm((p) => ({ ...p, district: e.target.value }))} />
            </div>
            <div className="form-field">
              <label>City</label>
              <input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
            </div>
            <div className="form-field">
              <label>Full address (tùy chọn)</label>
              <input
                value={form.fullAddress}
                onChange={(e) => setForm((p) => ({ ...p, fullAddress: e.target.value }))}
                placeholder="200 An Dương Vương, Phường 7, Quận 5, HCM"
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
            <div className="form-field">
              <label>Active</label>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
            </div>
          </div>
          <div className="flex" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn primary" type="submit">
              {editing ? 'Cập nhật Hub' : 'Thêm Hub'}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setForm((prev) => ({ ...prev, fullAddress: [prev.street, prev.ward, prev.district, prev.city].filter(Boolean).join(', ') }))}
            >
              Ghép fullAddress
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h4>Preview vị trí hub</h4>
        <DroneMapCanvas hubs={[]} drones={[]} routePoints={previewPoints} height={320} />
      </div>
    </>
  );
};

export default HubsPage;
