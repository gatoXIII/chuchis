import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Dumbbell, Apple, Pill, Loader2, AlertTriangle, Calendar, Clock, Activity } from 'lucide-react';

export default function RoutineViewer() {
  const { id, routineId } = useParams();
  const navigate = useNavigate();
  const { authFetch } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [routine, setRoutine] = useState(null);
  const [activeTab, setActiveTab] = useState('entrenamiento'); // entrenamiento, nutricion, suplementos

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`http://localhost:5000/api/clients/${id}/routines`);
        if (res.ok) {
          const allRoutines = await res.json();
          const found = allRoutines.find(r => r._id === routineId);
          setRoutine(found);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, routineId, authFetch]);

  if (loading) {
    return (
      <div className="page flex-center" style={{ minHeight: '60vh' }}>
        <Loader2 className="animate-spin" size={48} color="var(--brand)" />
      </div>
    );
  }

  if (!routine) {
    return (
      <div className="page text-center" style={{ paddingTop: '10vh' }}>
        <AlertTriangle size={48} color="var(--amber)" style={{ margin: '0 auto var(--s4)' }} />
        <h2>Rutina no encontrada</h2>
        <button className="btn btn-secondary mt-4" onClick={() => navigate(-1)}>Volver</button>
      </div>
    );
  }

  const { plan } = routine;
  
  return (
    <div className="page anim-fade-up">
      {/* ── Header ── */}
      <div style={{ marginBottom: 'var(--s6)' }}>
        <button className="btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 'var(--s3)', border: 'none', padding: 0 }}>
          <ArrowLeft size={16} /> Volver al Perfil
        </button>
        <div className="flex justify-between items-start" style={{ flexWrap: 'wrap', gap: 'var(--s4)' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              Rutina Estratégica
              <span className={`badge ${routine.estado === 'activa' ? 'badge-green' : 'badge-amber'}`}>
                {routine.estado.toUpperCase()}
              </span>
            </h1>
            <p className="page-subtitle mt-1">
              {plan?.split_name || 'Personalizada'} • {plan?.bloque_semanas || 4} Semanas • Generada el {new Date(routine.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => navigate(`/client/checkin`)}>
              📝 Ir al Check-in
            </button>
          </div>
        </div>
      </div>

      {/* ── Dashboard Quick Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--s3)', marginBottom: 'var(--s6)' }}>
        <div className="card" style={{ padding: 'var(--s4)', display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
          <div style={{ background: 'var(--brand-dim)', padding: 'var(--s2)', borderRadius: 'var(--r-sm)' }}><Dumbbell color="var(--brand)" /></div>
          <div>
            <div className="text-xs color-muted font-bold">ENTRENAMIENTO</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{plan?.dias_totales || '?'} días/sem</div>
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--s4)', display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
          <div style={{ background: 'var(--green-dim)', padding: 'var(--s2)', borderRadius: 'var(--r-sm)' }}><Apple color="var(--green)" /></div>
          <div>
            <div className="text-xs color-muted font-bold">NUTRICIÓN</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{plan?.nutrition_plan?.resumen_diario?.kcal || '--'} kcal</div>
          </div>
        </div>
        <div className="card" style={{ padding: 'var(--s4)', display: 'flex', alignItems: 'center', gap: 'var(--s3)' }}>
          <div style={{ background: 'var(--amber-dim)', padding: 'var(--s2)', borderRadius: 'var(--r-sm)' }}><Pill color="var(--amber)" /></div>
          <div>
            <div className="text-xs color-muted font-bold">SUPLEMENTOS</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{plan?.supplement_plan?.suplementos_prioritarios?.length || 0} esenciales</div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 'var(--s2)', marginBottom: 'var(--s4)', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {[
          { id: 'entrenamiento', icon: Dumbbell, label: 'Entrenamiento' },
          { id: 'nutricion', icon: Apple, label: 'Nutrición' },
          { id: 'suplementos', icon: Pill, label: 'Suplementos' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: 'var(--s3) var(--s4)', whiteSpace: 'nowrap',
              background: 'none', border: 'none',
              borderBottom: activeTab === t.id ? '2px solid var(--brand)' : '2px solid transparent',
              color: activeTab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
              fontFamily: 'var(--font-display)', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            <t.icon size={18} color={activeTab === t.id ? 'var(--brand)' : 'currentColor'} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content: Rutina ── */}
      {activeTab === 'entrenamiento' && (
        <div className="anim-fade-in flex-col gap-4">
          {plan?.notas_generales && (
            <div className="card" style={{ background: 'var(--bg-input)', border: 'none' }}>
              <strong className="color-brand text-sm flex items-center gap-2 mb-1"><Activity size={16}/> Enfoque Clínico</strong>
              <p className="text-sm color-secondary">{plan.notas_generales}</p>
            </div>
          )}
          
          {plan?.dias?.map((dia, idx) => (
            <div key={idx} className="card" style={{ padding: '0', overflow: 'hidden' }}>
              <div style={{ background: 'var(--bg-raised)', padding: 'var(--s4)', borderBottom: '1px solid var(--border)' }}>
                <h3 className="color-amber flex items-center gap-2">
                  <Calendar size={18} /> Día {dia.dia}: {dia.nombre}
                </h3>
                <p className="text-sm color-muted mt-1">Foco: {dia.musculos_foco?.join(', ')}</p>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', width: '25%' }}>Ejercicio</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', width: '15%' }}>Series/Reps</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', width: '15%' }}>Intensidad</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', width: '45%' }}>Notas / Justificación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dia.ejercicios.map((ej, ejIdx) => (
                      <tr key={ejIdx} style={{ borderBottom: '1px solid var(--border-hover)' }}>
                        <td style={{ padding: '16px', verticalAlign: 'top' }}>
                          <strong>{ej.nombre}</strong>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center', verticalAlign: 'top' }}>
                          <div style={{ background: 'var(--bg-input)', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
                            {ej.series} x {ej.repeticiones}
                          </div>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'center', verticalAlign: 'top' }}>
                          <div className="color-brand font-bold">RPE {ej.rpe_objetivo}</div>
                          {ej.peso_sugerido_kg && <div className="text-xs color-muted mt-1">{ej.peso_sugerido_kg}kg</div>}
                        </td>
                        <td style={{ padding: '16px', verticalAlign: 'top' }}>
                          {ej.nota && <div className="text-sm color-secondary mb-2">💡 {ej.nota}</div>}
                          {ej.explicacion_cliente && <div className="text-sm mb-2" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>"{ej.explicacion_cliente}"</div>}
                          {ej.explicacion_tecnica && (
                            <div className="text-xs mt-2" style={{ background: 'rgba(255,90,0,0.05)', padding: '6px 10px', borderRadius: '4px', borderLeft: '2px solid var(--brand)' }}>
                              <strong className="color-brand">Razón Técnica:</strong> {ej.explicacion_tecnica}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab Content: Nutrición ── */}
      {activeTab === 'nutricion' && (
        <div className="anim-fade-in flex-col gap-4">
          {plan?.nutrition_plan ? (
            <>
              <div className="card text-center" style={{ padding: 'var(--s6)', background: 'linear-gradient(135deg, rgba(0,230,118,0.1) 0%, transparent 100%)' }}>
                <Apple size={32} color="var(--green)" style={{ margin: '0 auto var(--s2)' }} />
                <h3>{plan.nutrition_plan.resumen_diario?.kcal} kcal / día</h3>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--s4)', marginTop: 'var(--s3)' }}>
                  <div><strong className="color-green">{plan.nutrition_plan.resumen_diario?.proteina_g}g</strong> Proteína</div>
                  <div><strong className="color-brand">{plan.nutrition_plan.resumen_diario?.carbs_g}g</strong> Carbohidratos</div>
                  <div><strong className="color-amber">{plan.nutrition_plan.resumen_diario?.grasa_g}g</strong> Grasas</div>
                </div>
              </div>

              {Object.entries(plan.nutrition_plan.estructura_comidas || {}).map(([comida, detalles]) => (
                <div key={comida} className="card" style={{ display: 'flex', gap: 'var(--s4)' }}>
                  <div style={{ minWidth: '120px' }}>
                    <div className="text-xs color-green font-bold uppercase">{comida.replace('_', ' ')}</div>
                    <div className="text-sm color-muted mt-1">{detalles.kcal} kcal aprox</div>
                  </div>
                  <div style={{ flex: 1, borderLeft: '1px solid var(--border)', paddingLeft: 'var(--s4)' }}>
                    <ul style={{ margin: 0, paddingLeft: '1rem', color: 'var(--text-secondary)' }}>
                      {detalles.opciones?.map((opc, i) => (
                        <li key={i} style={{ marginBottom: '6px' }}>{opc}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="card text-center" style={{ padding: 'var(--s8)' }}>
              <p className="color-muted">No se generó un plan nutricional para esta rutina.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab Content: Suplementos ── */}
      {activeTab === 'suplementos' && (
        <div className="anim-fade-in flex-col gap-4">
          {plan?.supplement_plan ? (
            <>
              <div className="card" style={{ background: 'var(--bg-input)', border: 'none' }}>
                <p className="color-secondary">{plan.supplement_plan.resumen_ejecutivo}</p>
                <div className="text-xs mt-3 color-amber" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <AlertTriangle size={14} /> {plan.supplement_plan.disclaimer}
                </div>
              </div>

              <h3 className="mt-2 color-brand">Prioritarios (Evidencia Sólida)</h3>
              {plan.supplement_plan.suplementos_prioritarios?.map((sup, idx) => (
                <div key={idx} className="card" style={{ borderLeft: '3px solid var(--brand)' }}>
                  <div className="flex justify-between items-start mb-2">
                    <h4 style={{ fontSize: '1.1rem' }}>{sup.nombre}</h4>
                    <span className="badge badge-brand">{sup.evidencia}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--s3)', marginBottom: 'var(--s3)' }}>
                    <div><strong className="text-xs color-muted block">DOSIS</strong>{sup.dosis}</div>
                    <div><strong className="text-xs color-muted block">CUÁNDO TOMAR</strong>{sup.momento_de_toma || sup.momento}</div>
                    <div><strong className="text-xs color-muted block">COSTO APROX</strong>${sup.costo_mensual_mxn_aprox} MXN/mes</div>
                  </div>
                  
                  <div style={{ background: 'var(--bg-raised)', padding: 'var(--s3)', borderRadius: 'var(--r-sm)', fontSize: '0.9rem' }}>
                    <div className="mb-2"><strong className="color-green">¿Por qué es recomendable?</strong><br/>{sup.por_que_es_recomendable || sup.razon_cientifica}</div>
                    {sup.por_que_si_debes && <div className="mb-2"><strong className="color-brand">Beneficio para ti:</strong><br/>{sup.por_que_si_debes}</div>}
                    {sup.peligros_o_efectos && <div className="mb-2"><strong className="color-amber">Riesgos / Efectos:</strong><br/>{sup.peligros_o_efectos}</div>}
                    {sup.por_que_no_deberias && <div><strong className="color-red">Cuándo NO tomarlo:</strong><br/>{sup.por_que_no_deberias}</div>}
                  </div>
                </div>
              ))}

              {plan.supplement_plan.suplementos_opcionales?.length > 0 && (
                <>
                  <h3 className="mt-4 color-muted">Opcionales</h3>
                  {plan.supplement_plan.suplementos_opcionales.map((sup, idx) => (
                    <div key={idx} className="card" style={{ borderLeft: '3px solid var(--text-muted)', opacity: 0.85 }}>
                      <div className="flex justify-between items-start mb-2">
                        <h4 style={{ fontSize: '1.1rem' }}>{sup.nombre}</h4>
                        <span className="badge">{sup.evidencia}</span>
                      </div>
                      <div className="text-sm color-secondary mb-2">{sup.por_que_es_recomendable || sup.razon_cientifica}</div>
                      <div className="text-sm"><strong>Dosis:</strong> {sup.dosis} | <strong>Cuándo:</strong> {sup.momento_de_toma || sup.momento}</div>
                    </div>
                  ))}
                </>
              )}

              {plan.supplement_plan.suplementos_a_evitar?.length > 0 && (
                <div className="card" style={{ background: 'rgba(255,75,85,0.05)', borderColor: 'rgba(255,75,85,0.2)' }}>
                  <h4 className="color-red flex items-center gap-2 mb-2"><AlertTriangle size={16} /> Suplementos a Evitar</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--red)' }}>
                    {plan.supplement_plan.suplementos_a_evitar.map((sup, i) => (
                      <li key={i}>{sup}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="card text-center" style={{ padding: 'var(--s8)' }}>
              <p className="color-muted">No se generó un plan de suplementación para esta rutina.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
