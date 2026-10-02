import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

// Términos y privacidad (públicos, se enlazan desde el registro)
export default function LegalDoc() {
  const { doc } = useParams();
  const [text, setText] = useState('Cargando…');
  useEffect(() => {
    axios.get(`/api/compliance/legal/${doc}`).then(r => setText(r.data)).catch(() => setText('Documento no encontrado.'));
  }, [doc]);
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
      <Link to="/login">← Volver</Link>
      <div className="card" style={{ marginTop: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}
