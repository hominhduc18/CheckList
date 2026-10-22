export default function PaperChecklistTable({ newEntry, extraLogs = [] }) {
  // Dữ liệu mẫu thực tế từ ảnh chụp của khoa
  const baseLogs = [
    { time: '7:15 17.10.26', v1: true, v2: true, v3: true, v4: true, v5: true, v6: true, signer: 'Trinh M' },
    { time: '7:15 19.10.26', v1: true, v2: true, v3: true, v4: true, v5: true, v6: true, signer: 'Trinh M' },
    { time: '7:00 20.10.26', v1: true, v2: true, v3: true, v4: true, v5: true, v6: true, signer: 'Trinh' },
    { time: '7:00 21.10.26', v1: true, v2: true, v3: true, v4: true, v5: true, v6: true, signer: 'Vân' },
  ];

  const currentEntry = newEntry
    ? [
        {
          time: `${newEntry.time_display || '7:15'} ${newEntry.date_display || '22.10.26'}`,
          v1: true,
          v2: true,
          v3: true,
          v4: true,
          v5: true,
          v6: true,
          signer: newEntry.performer_name || 'Đã ký',
          isNew: true,
        },
      ]
    : [];

  const allLogs = [...currentEntry, ...extraLogs, ...baseLogs];

  return (
    <div
      className="paper-sheet-container"
      style={{
        marginTop: '20px',
        background: '#ffffff',
        border: '2px solid #0f172a',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        fontFamily: '"Times New Roman", Times, Georgia, serif',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
        <div style={{ fontStyle: 'italic', fontSize: '1.05rem', fontWeight: 'bold', color: '#0f172a' }}>
          Khoa khám bệnh
        </div>
        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
          Sổ kiểm tra hằng ngày
        </div>
      </div>

      <div
        style={{
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '1.05rem',
          margin: '8px 0 14px',
          letterSpacing: '0.3px',
          color: '#0f172a',
          lineHeight: '1.4',
        }}
      >
        BẢNG KIỂM TRA CHECKLIST HẰNG NGÀY PHÒNG LẤY MÁU, ĐIỆN TIM
      </div>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table
          style={{
            width: '100%',
            minWidth: '650px',
            borderCollapse: 'collapse',
            textAlign: 'center',
            fontSize: '0.82rem',
            border: '1.5px solid #0f172a',
          }}
        >
          <thead>
            <tr style={{ background: '#f8fafc', color: '#0f172a' }}>
              <th style={{ border: '1px solid #0f172a', padding: '6px 4px', fontWeight: 'bold', width: '100px' }}>
                THỜI GIAN THỰC HIỆN
              </th>
              <th style={{ border: '1px solid #0f172a', padding: '6px 4px', fontWeight: 'bold' }}>
                VỆ SINH BÀN LẤY MÁU, GIƯỜNG, PHÒNG
              </th>
              <th style={{ border: '1px solid #0f172a', padding: '6px 4px', fontWeight: 'bold' }}>
                VỆ SINH MÁY, XE ĐIỆN TIM, MÁY TÍNH
              </th>
              <th style={{ border: '1px solid #0f172a', padding: '6px 4px', fontWeight: 'bold' }}>
                KIỂM TRA ĐẦY ĐỦ DỤNG CỤ PHÒNG
              </th>
              <th style={{ border: '1px solid #0f172a', padding: '6px 4px', fontWeight: 'bold' }}>
                THAY KHAY DỤNG CỤ LẤY MÁU
              </th>
              <th style={{ border: '1px solid #0f172a', padding: '6px 4px', fontWeight: 'bold' }}>
                CỒN XỊT SÁT KHUẨN
              </th>
              <th style={{ border: '1px solid #0f172a', padding: '6px 4px', fontWeight: 'bold' }}>
                SẮP XẾP PHÒNG GỌN GÀNG, SẠCH SẼ
              </th>
              <th style={{ border: '1px solid #0f172a', padding: '6px 4px', fontWeight: 'bold', width: '80px' }}>
                KÝ TÊN
              </th>
            </tr>
          </thead>
          <tbody>
            {allLogs.map((row, idx) => (
              <tr
                key={idx}
                style={{
                  background: row.isNew ? '#ecfdf5' : idx % 2 === 0 ? '#ffffff' : '#fcfcfd',
                  height: '36px',
                }}
              >
                <td style={{ border: '1px solid #0f172a', padding: '4px', fontWeight: 'bold', fontSize: '0.85rem' }}>
                  {row.time}
                </td>
                <td style={{ border: '1px solid #0f172a', padding: '4px', color: '#15803d', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  ✓
                </td>
                <td style={{ border: '1px solid #0f172a', padding: '4px', color: '#15803d', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  ✓
                </td>
                <td style={{ border: '1px solid #0f172a', padding: '4px', color: '#15803d', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  ✓
                </td>
                <td style={{ border: '1px solid #0f172a', padding: '4px', color: '#15803d', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  ✓
                </td>
                <td style={{ border: '1px solid #0f172a', padding: '4px', color: '#15803d', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  ✓
                </td>
                <td style={{ border: '1px solid #0f172a', padding: '4px', color: '#15803d', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  ✓
                </td>
                <td
                  style={{
                    border: '1px solid #0f172a',
                    padding: '4px',
                    fontStyle: 'italic',
                    fontWeight: 'bold',
                    fontSize: '0.92rem',
                    color: row.isNew ? '#0b5cab' : '#1e293b',
                  }}
                >
                  {row.signer}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', textAlign: 'right' }}>
        * Biên bản điện tử đồng bộ lưu trữ số theo quy chuẩn 5S bệnh viện
      </p>
    </div>
  );
}
