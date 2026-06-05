import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getRooms,
  joinRoom,
  createRoom,
  deleteRoom,
} from '../services/roomService'
import {
  clearAuthSession,
  getCurrentUsername,
  getCurrentUserRole,
  saveSelectedRoom,
} from '../services/authSession'
import classes from './RoomsPage.module.css'

function RoomsPage() {
  const navigate = useNavigate()

  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomDescription, setNewRoomDescription] = useState('')
  const [creatingRoom, setCreatingRoom] = useState(false)
  const [deletingRoomId, setDeletingRoomId] = useState(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')

  const username = getCurrentUsername() || 'Você'
  const isAdmin = getCurrentUserRole() === 'ADMIN'

  useEffect(() => {
    loadRooms()
  }, [])

  async function loadRooms() {
    try {
      setLoading(true)
      setFeedbackMessage('')
      const data = await getRooms()
      setRooms(data)
    } catch (error) {
      console.error(error)
      setFeedbackMessage('Não foi possível carregar as salas agora.')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinRoom(room) {
    try {
      await joinRoom(room.id)
    } catch (error) {
      const message = error.response?.data?.message || ''

      if (!message.toLowerCase().includes('já está na sala')) {
        console.error(error)
        setFeedbackMessage(message || 'Não foi possível entrar nessa sala.')
        return
      }
    }

    saveSelectedRoom(room)

    navigate(`/rooms/${room.id}`)
  }

  async function handleCreateRoom(event) {
    event.preventDefault()

    if (!newRoomName.trim()) {
      setFeedbackMessage('Informe o nome da sala.')
      return
    }

    try {
      setCreatingRoom(true)
      setFeedbackMessage('')

      await createRoom(newRoomName, newRoomDescription)

      setNewRoomName('')
      setNewRoomDescription('')
      setShowCreateModal(false)

      await loadRooms()
    } catch (error) {
      console.error(error)
      if (error.response?.status === 403) {
        setFeedbackMessage('Você não tem permissão para criar salas.')
        return
      }

      setFeedbackMessage('Não foi possível criar a sala agora.')
    } finally {
      setCreatingRoom(false)
    }
  }

  async function handleDeleteRoom(event, room) {
    event.stopPropagation()

    const confirmed = window.confirm(
      `Tem certeza que deseja excluir a sala "${room.name}"? Essa ação não pode ser desfeita.`
    )

    if (!confirmed) return

    try {
      setDeletingRoomId(room.id)
      setFeedbackMessage('')

      await deleteRoom(room.id)
      await loadRooms()
    } catch (error) {
      console.error(error)

      if (error.response?.status === 403) {
        setFeedbackMessage('Você não tem permissão para excluir salas.')
        return
      }

      setFeedbackMessage('Não foi possível excluir essa sala.')
    } finally {
      setDeletingRoomId(null)
    }
  }

  function handleOpenCreateModal() {
    if (!isAdmin) {
      setFeedbackMessage('Você não tem permissão para criar salas.')
      return
    }

    setShowCreateModal(true)
  }

  function handleLogout() {
    clearAuthSession()
    navigate('/')
  }

  return (
    <>
      <div className={classes.appShell} style={styles.app}>
        <style>
          {`
            @keyframes fadeUp {
              from {
                opacity: 0;
                transform: translateY(18px);
              }

              to {
                opacity: 1;
                transform: translateY(0);
              }
            }

            @keyframes floatGlow {
              0% {
                transform: translateY(0px);
                opacity: 0.75;
              }

              50% {
                transform: translateY(-14px);
                opacity: 1;
              }

              100% {
                transform: translateY(0px);
                opacity: 0.75;
              }
            }

            @keyframes pulseOnline {
              0% {
                box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55);
              }

              70% {
                box-shadow: 0 0 0 9px rgba(34, 197, 94, 0);
              }

              100% {
                box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
              }
            }

          `}
        </style>

        <div style={styles.backgroundOrbOne} />
        <div style={styles.backgroundOrbTwo} />
        <div style={styles.backgroundOrbThree} />
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <button
              style={styles.logoButton}
              onClick={() => navigate('/rooms')}
              title="Voltar para salas"
            >
              <span style={styles.logoInitial}>D</span>
              <span style={styles.logoText}>iscordia</span>
            </button>

            <button
              className={classes.logoutButton}
              style={styles.topLogoutButton}
              onClick={handleLogout}
            >
              Sair
            </button>
          </div>

          <div style={styles.profileCard}>
            <div style={styles.profileAvatar}>
              {username.charAt(0).toUpperCase()}
            </div>

            <div style={styles.profileInfo}>
              <strong style={styles.profileName}>{username}</strong>

              <div style={styles.onlineRow}>
                <span style={styles.onlineDot} />
                <p style={styles.onlineText}>online agora</p>
              </div>
            </div>
          </div>

          {isAdmin && (
            <div style={styles.sidebarButtons}>
              <button
                className={classes.actionButton}
                style={styles.primarySidebarButton}
                onClick={handleOpenCreateModal}
              >
                <span style={styles.buttonIcon}>+</span>
                Nova sala
              </button>
            </div>
          )}

          <div style={styles.sidebarSection}>
            <div style={styles.sidebarSectionHeader}>
              <span>Canais</span>
              <span style={styles.sidebarCounter}>{rooms.length}</span>
            </div>

            <div style={styles.sidebarRoomList}>
              {rooms.slice(0, 6).map((room) => (
                <button
                  key={room.id}
                  style={styles.sidebarRoomItem}
                  onClick={() => handleJoinRoom(room)}
                >
                  <span style={styles.sidebarHash}>#</span>
                  <span style={styles.sidebarRoomName}>{room.name}</span>
                </button>
              ))}

              {!loading && rooms.length === 0 && (
                <p style={styles.sidebarEmptyText}>
                  Nenhuma sala criada ainda.
                </p>
              )}
            </div>
          </div>
        </aside>

        <main className={classes.mainScroll} style={styles.main}>
          <header style={styles.header}>
            <div>
              <h2 style={styles.pageTitle}>Escolha uma sala</h2>

              <p style={styles.pageSubtitle}>
                Entre em um canal e comece a conversar.
              </p>
            </div>

            <button
              className={classes.refreshButton}
              style={styles.refreshButton}
              onClick={loadRooms}
              disabled={loading}
            >
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </header>

          <section style={styles.hero}>
            <div style={styles.heroContent}>
              <h1 style={styles.heroTitle}>
                Encontre sua sala e entre na conversa.
              </h1>

              <p style={styles.heroText}>
                Encontre uma sala e entre na discussao em tempo real.
              </p>

              <div style={styles.heroActions}>
                {isAdmin && (
                  <button
                    className={classes.actionButton}
                    style={styles.heroPrimaryButton}
                    onClick={handleOpenCreateModal}
                  >
                    Criar sala
                  </button>
                )}

                <button
                  className={classes.refreshButton}
                  style={styles.heroSecondaryButton}
                  onClick={loadRooms}
                >
                  Atualizar
                </button>
              </div>
            </div>

            <div style={styles.heroBadge}>
              <span style={styles.heroBadgeNumber}>{rooms.length}</span>

              <span style={styles.heroBadgeLabel}>
                {rooms.length === 1 ? 'sala ativa' : 'salas ativas'}
              </span>
            </div>
          </section>

          <section style={styles.roomsSection}>
            <div style={styles.sectionHeader}>
              <h3 style={styles.sectionTitle}>Salas disponíveis</h3>

              <span style={styles.sectionCount}>{rooms.length}</span>
            </div>

            {feedbackMessage && (
              <div style={styles.feedbackBanner}>
                {feedbackMessage}
              </div>
            )}

            {loading && (
              <div style={styles.centerState}>
                <div style={styles.loadingIcon}>#</div>
                <p>Carregando salas...</p>
              </div>
            )}

            {!loading && rooms.length === 0 && (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>#</div>
                <h2 style={styles.emptyTitle}>Nenhuma sala disponível</h2>

                <p style={styles.emptyText}>
                  Crie a primeira sala para começar a testar o Discordia em tempo real.
                </p>

                {isAdmin && (
                  <button
                    className={classes.actionButton}
                    style={styles.emptyButton}
                    onClick={handleOpenCreateModal}
                  >
                    Criar primeira sala
                  </button>
                )}
              </div>
            )}

            {!loading && rooms.length > 0 && (
              <div style={styles.roomsGrid}>
                {rooms.map((room, index) => (
<article
  className={classes.roomCard}
  key={room.id}
  style={styles.roomCard}
>
  <div
    className={classes.cardGlow}
    style={styles.cardGlow}
  />

  <div style={styles.roomTop}>
    <div style={styles.roomIcon}>#</div>

    <span style={styles.roomTag}>
      canal {String(index + 1).padStart(2, '0')}
    </span>
  </div>

  <div style={styles.roomBody}>
    <h3 style={styles.roomName}>{room.name}</h3>

    <p style={styles.roomDescription}>
      {room.description || 'Sala sem descrição.'}
    </p>
  </div>

  <div style={styles.roomFooter}>
    <div style={styles.roomMeta}>
      <span style={styles.liveDot} />
      <span>tempo real</span>
    </div>

    <div style={styles.roomActions}>
      {isAdmin && (
        <button
          className={classes.deleteButton}
          style={{
            ...styles.deleteButton,
            opacity: deletingRoomId === room.id ? 0.65 : 1,
            cursor: deletingRoomId === room.id ? 'not-allowed' : 'pointer',
          }}
          onClick={(event) => handleDeleteRoom(event, room)}
          disabled={deletingRoomId === room.id}
          title="Excluir sala"
        >
          {deletingRoomId === room.id ? '...' : 'Excluir'}
        </button>
      )}

      <button
        className={classes.joinButton}
        style={styles.joinButton}
        onClick={() => handleJoinRoom(room)}
      >
        Entrar
      </button>
    </div>
  </div>
</article>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalGlow} />

            <div style={styles.modalHeader}>
              <div>
                <p style={styles.modalEyebrow}>Novo canal</p>

                <h2 style={styles.modalTitle}>Criar nova sala</h2>

                <p style={styles.modalSubtitle}>
                  Configure um espaço para conversa em tempo real.
                </p>
              </div>

              <button
                className={classes.modalClose}
                style={styles.closeButton}
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>

            <form style={styles.modalForm} onSubmit={handleCreateRoom}>
              <label style={styles.modalLabel}>
                Nome da sala
                <input
                  className={classes.modalInput}
                  type="text"
                  placeholder="Ex: geral, estudos, jogos..."
                  value={newRoomName}
                  onChange={(event) => setNewRoomName(event.target.value)}
                  style={styles.modalInput}
                />
              </label>

              <label style={styles.modalLabel}>
                Descrição
                <textarea
                  className={classes.modalTextarea}
                  placeholder="Descreva rapidamente o objetivo dessa sala"
                  value={newRoomDescription}
                  onChange={(event) =>
                    setNewRoomDescription(event.target.value)
                  }
                  style={styles.textarea}
                />
              </label>

              <button
                type="submit"
                style={{
                  ...styles.modalButton,
                  opacity: creatingRoom ? 0.75 : 1,
                  cursor: creatingRoom ? 'not-allowed' : 'pointer',
                }}
                disabled={creatingRoom}
              >
                {creatingRoom ? 'Criando sala...' : 'Criar sala'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

const styles = {
  app: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: '330px 1fr',
    width: '100%',
    height: '100vh',
    overflow: 'hidden',
    background:
      '#121214',
    color: '#f1f1f3',
  },

  backgroundOrbOne: {
    display: 'none',
    position: 'absolute',
    width: '360px',
    height: '360px',
    borderRadius: '999px',
    background: 'transparent',
    filter: 'blur(90px)',
    top: '-120px',
    left: '180px',
    animation: 'floatGlow 8s ease-in-out infinite',
    pointerEvents: 'none',
  },

  backgroundOrbTwo: {
    display: 'none',
    position: 'absolute',
    width: '420px',
    height: '420px',
    borderRadius: '999px',
    background: 'transparent',
    filter: 'blur(96px)',
    bottom: '-160px',
    right: '-80px',
    animation: 'floatGlow 10s ease-in-out infinite',
    pointerEvents: 'none',
  },

  backgroundOrbThree: {
    display: 'none',
    position: 'absolute',
    width: '260px',
    height: '260px',
    borderRadius: '999px',
    background: 'rgba(34, 211, 238, 0.1)',
    filter: 'blur(80px)',
    top: '42%',
    left: '54%',
    animation: 'floatGlow 9s ease-in-out infinite',
    pointerEvents: 'none',
  },

  serverBar: {
    position: 'relative',
    zIndex: 3,
    background: '#121214',
    borderRight: '1px solid rgba(148, 163, 184, 0.12)',
    backdropFilter: 'blur(22px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '18px',
    gap: '14px',
  },

  serverLogo: {
    width: '52px',
    height: '52px',
    border: 'none',
    borderRadius: '6px',
    background: '#2563eb',
    color: '#f1f1f3',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: '900',
    fontSize: '23px',
    boxShadow: 'none',
    cursor: 'pointer',
  },

  serverDivider: {
    width: '34px',
    height: '2px',
    borderRadius: '999px',
    background: 'rgba(148, 163, 184, 0.22)',
  },

  serverButton: {
    width: '48px',
    height: '48px',
    border: '1px solid rgba(129, 140, 248, 0.22)',
    borderRadius: '6px',
    background: '#202226',
    color: '#f1f1f3',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '22px',
    fontWeight: '900',
    cursor: 'pointer',
    boxShadow: 'none',
  },

  serverGhostButton: {
    width: '48px',
    height: '48px',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    borderRadius: '50%',
    background: '#1a1b1e',
    color: '#b8bcc6',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '16px',
    fontWeight: '900',
    cursor: 'not-allowed',
  },

  sidebar: {
    position: 'relative',
    zIndex: 3,
    background:
      '#18191c',
    borderRight: '1px solid rgba(148, 163, 184, 0.12)',
    backdropFilter: 'blur(24px)',
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: '20px',
  },

  sidebarHeader: {
    minHeight: '86px',
    padding: '0 22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
  },

  logoButton: {
    border: 'none',
    background: 'transparent',
    color: '#f1f1f3',
    display: 'inline-flex',
    alignItems: 'baseline',
    padding: 0,
    cursor: 'pointer',
    fontSize: '29px',
    fontWeight: '950',
    letterSpacing: '-1px',
  },

  logoInitial: {
    color: '#3b82f6',
  },

  logoText: {
    color: '#f1f1f3',
  },

  logo: {
    margin: 0,
    fontSize: '29px',
    fontWeight: '950',
    letterSpacing: '-1px',
  },

  logoSubtitle: {
    margin: '3px 0 0',
    color: '#8a9099',
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.7px',
  },

  topLogoutButton: {
    height: '38px',
    padding: '0 14px',
    border: '1px solid rgba(148, 163, 184, 0.14)',
    borderRadius: '6px',
    background: '#121214',
    color: '#f1f1f3',
    fontWeight: '800',
    cursor: 'pointer',
    transition: '0.22s ease',
  },

  profileCard: {
    margin: '18px',
    padding: '16px',
    borderRadius: '8px',
    background: '#202226',
    border: '1px solid #34363b',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    boxShadow: 'none',
  },

  profileAvatar: {
    width: '48px',
    height: '48px',
    borderRadius: '6px',
    background: '#2563eb',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: '900',
    boxShadow: 'none',
  },

  profileInfo: {
    minWidth: 0,
  },

  profileName: {
    display: 'block',
    maxWidth: '190px',
    color: '#f1f1f3',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  onlineRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    marginTop: '5px',
  },

  onlineDot: {
    width: '8px',
    height: '8px',
    borderRadius: '999px',
    background: '#22c55e',
    animation: 'pulseOnline 1.8s infinite',
  },

  onlineText: {
    margin: 0,
    color: '#86efac',
    fontSize: '13px',
    fontWeight: 700,
  },

  sidebarButtons: {
    padding: '0 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  primarySidebarButton: {
    height: '52px',
    border: 'none',
    borderRadius: '6px',
    background: '#3b82f6',
    color: 'white',
    fontWeight: '900',
    fontSize: '15px',
    cursor: 'pointer',
    transition: '0.22s ease',
    boxShadow: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },

  buttonIcon: {
    fontSize: '20px',
    lineHeight: 1,
  },

  sidebarSection: {
    padding: '22px 18px 0',
  },

  sidebarSectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#8a9099',
    fontSize: '12px',
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: '12px',
  },

  sidebarCounter: {
    minWidth: '24px',
    height: '24px',
    padding: '0 8px',
    borderRadius: '999px',
    background: '#18191c',
    display: 'grid',
    placeItems: 'center',
    color: '#b8bcc6',
  },

sidebarRoomList: {
  display: 'grid',
  gap: '7px',
  maxHeight: 'calc(100vh - 350px)', 
  overflowY: 'auto',                
  paddingRight: '5px',              
},
  
  sidebarRoomItem: {
    height: '38px',
    border: 'none',
    borderRadius: '12px',
    background: 'transparent',
    color: '#b8bcc6',
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '0 10px',
    cursor: 'pointer',
    fontWeight: 700,
    textAlign: 'left',
  },

  sidebarHash: {
    color: '#60a5fa',
    fontSize: '18px',
    fontWeight: 900,
  },

  sidebarRoomName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  sidebarEmptyText: {
    margin: 0,
    color: '#8a9099',
    fontSize: '13px',
    lineHeight: 1.5,
  },

  main: {
    position: 'relative',
    zIndex: 2,
    height: '100vh',
    overflowY: 'auto',
    paddingBottom: '36px',
  },

  header: {
    minHeight: '86px',
    padding: '0 34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
    background: '#1a1b1e',
    backdropFilter: 'blur(18px)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },

  pageTitle: {
    margin: 0,
    fontSize: '27px',
    fontWeight: '950',
    letterSpacing: '-0.8px',
  },

  pageSubtitle: {
    color: '#b8bcc6',
    margin: '5px 0 0',
    fontSize: '14px',
  },

  refreshButton: {
    height: '44px',
    padding: '0 18px',
    border: '1px solid rgba(148, 163, 184, 0.14)',
    borderRadius: '6px',
    background: '#121214',
    color: '#f1f1f3',
    fontWeight: '900',
    cursor: 'pointer',
    transition: '0.22s ease',
  },

  hero: {
    margin: '34px',
    padding: '28px',
    minHeight: '190px',
    borderRadius: '8px',
    background: '#18191c',
    border: '1px solid #34363b',
    boxShadow: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '42px',
    animation: 'fadeUp 0.7s ease forwards',
  },

  heroContent: {
    maxWidth: '760px',
  },

  heroTitle: {
    maxWidth: '760px',
    fontSize: 'clamp(30px, 3vw, 44px)',
    lineHeight: 1.05,
    letterSpacing: 0,
    margin: 0,
    fontWeight: 850,
  },

  heroText: {
    maxWidth: '560px',
    color: '#b8bcc6',
    lineHeight: 1.6,
    fontSize: '16px',
    margin: '16px 0 0',
  },

  heroActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '26px',
    flexWrap: 'wrap',
  },

  heroPrimaryButton: {
    height: '48px',
    padding: '0 20px',
    border: 'none',
    borderRadius: '6px',
    background: '#3b82f6',
    color: '#f1f1f3',
    fontWeight: 900,
    cursor: 'pointer',
    transition: '0.22s ease',
    boxShadow: 'none',
  },

  heroSecondaryButton: {
    height: '48px',
    padding: '0 20px',
    border: '1px solid #34363b',
    borderRadius: '6px',
    background: '#121214',
    color: '#f1f1f3',
    fontWeight: 900,
    cursor: 'pointer',
    transition: '0.22s ease',
  },

  heroBadge: {
    minWidth: '160px',
    height: '150px',
    borderRadius: '8px',
    background: '#202226',
    border: '1px solid #34363b',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: 'none',
  },

  heroBadgeNumber: {
    fontSize: '54px',
    fontWeight: '950',
    lineHeight: 1,
    color: '#f1f1f3',
  },

  heroBadgeLabel: {
    marginTop: '8px',
    color: '#b8bcc6',
    fontWeight: '800',
  },

  roomsSection: {
    padding: '0 34px',
  },

  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '18px',
    marginBottom: '20px',
  },

  sectionTitle: {
    margin: 0,
    fontSize: '24px',
    fontWeight: '950',
    letterSpacing: '-0.6px',
  },

  sectionCount: {
    minWidth: '36px',
    height: '36px',
    padding: '0 12px',
    borderRadius: '999px',
    background: '#121214',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: '#c7d2fe',
    fontWeight: '900',
  },

  feedbackBanner: {
    marginBottom: '18px',
    padding: '14px 16px',
    borderRadius: '6px',
    background: 'rgba(248, 113, 113, 0.12)',
    border: '1px solid rgba(248, 113, 113, 0.22)',
    color: '#fecaca',
    fontSize: '14px',
    fontWeight: 800,
    boxShadow: '0 16px 34px rgba(0, 0, 0, 0.16)',
  },

  roomsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(285px, 1fr))',
    gap: '20px',
    animation: 'fadeUp 0.7s ease forwards',
  },

  roomCard: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: '246px',
    borderRadius: '8px',
    padding: '23px',
    background:
      '#1a1b1e',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    boxShadow: '0 18px 50px rgba(0, 0, 0, 0.23)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    transition:
      'transform 0.24s ease, box-shadow 0.24s ease, border-color 0.24s ease',
    cursor: 'default',
  },

  cardGlow: {
    display: 'none',
    position: 'absolute',
    top: '-60px',
    right: '-60px',
    width: '160px',
    height: '160px',
    borderRadius: '50%',
    background: 'transparent',
    filter: 'blur(12px)',
    opacity: 0.62,
    transition: '0.28s ease',
  },

  roomTop: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  roomIcon: {
    width: '50px',
    height: '50px',
    borderRadius: '6px',
    background: 'rgba(2, 6, 23, 0.52)',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '27px',
    fontWeight: '950',
    color: '#a5b4fc',
  },

  roomTag: {
    color: '#8a9099',
    fontSize: '12px',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: '0.7px',
  },

  roomBody: {
    position: 'relative',
    zIndex: 1,
    marginTop: '22px',
    flex: 1,
  },

  roomName: {
    fontSize: '30px',
    lineHeight: 1.08,
    margin: 0,
    letterSpacing: '-1px',
  },

  roomDescription: {
    color: 'rgba(226, 232, 240, 0.66)',
    lineHeight: 1.55,
    margin: '12px 0 0',
    fontSize: '14px',
  },

  roomFooter: {
    position: 'relative',
    zIndex: 1,
    marginTop: '24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
  },

  roomMeta: {
    color: 'rgba(203, 213, 225, 0.56)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: '800',
  },

  liveDot: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    background: '#22c55e',
    boxShadow: '0 0 12px rgba(34, 197, 94, 0.8)',
  },

  joinButton: {
    height: '44px',
    padding: '0 19px',
    border: 'none',
    borderRadius: '6px',
    background: '#22c55e',
    color: 'white',
    fontWeight: '950',
    cursor: 'pointer',
    transition: '0.22s ease',
    boxShadow: '0 12px 26px rgba(34, 197, 94, 0.24)',
  },

  roomActions: {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
},

deleteButton: {
  height: '44px',
  padding: '0 15px',
  border: '1px solid rgba(248, 113, 113, 0.24)',
  borderRadius: '6px',
  background: 'rgba(127, 29, 29, 0.18)',
  color: '#fecaca',
  fontWeight: '900',
  cursor: 'pointer',
  transition: '0.22s ease',
},

  centerState: {
    minHeight: '300px',
    borderRadius: '8px',
    background: 'rgba(15, 23, 42, 0.52)',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    color: 'rgba(203, 213, 225, 0.65)',
    gap: '12px',
  },

  loadingIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '8px',
    background: '#3b82f6',
    display: 'grid',
    placeItems: 'center',
    fontSize: '30px',
    fontWeight: 950,
    boxShadow: 'none',
  },

  emptyState: {
    minHeight: '380px',
    borderRadius: '8px',
    background:
      'linear-gradient(180deg, rgba(15, 23, 42, 0.72), rgba(15, 23, 42, 0.52))',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    color: 'rgba(203, 213, 225, 0.64)',
    textAlign: 'center',
    padding: '34px',
    boxShadow: '0 22px 60px rgba(0, 0, 0, 0.24)',
  },

  emptyIcon: {
    width: '88px',
    height: '88px',
    borderRadius: '8px',
    background: '#2563eb',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '42px',
    fontWeight: 950,
    marginBottom: '22px',
    boxShadow: 'none',
  },

  emptyTitle: {
    margin: 0,
    color: '#f1f1f3',
    fontSize: '28px',
  },

  emptyText: {
    maxWidth: '420px',
    lineHeight: 1.6,
  },

  emptyButton: {
    marginTop: '12px',
    height: '48px',
    padding: '0 22px',
    border: 'none',
    borderRadius: '6px',
    background: '#3b82f6',
    color: 'white',
    fontWeight: 900,
    cursor: 'pointer',
    transition: '0.22s ease',
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: '#121214',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    padding: '24px',
  },

  modal: {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
    maxWidth: '570px',
    borderRadius: '8px',
    padding: '31px',
    background:
      '#1a1b1e',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    boxShadow:
      '0 34px 90px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    animation: 'fadeUp 0.35s ease forwards',
  },

  modalGlow: {
    display: 'none',
    position: 'absolute',
    top: '-70px',
    right: '-70px',
    width: '200px',
    height: '200px',
    borderRadius: '50%',
    background:
      'radial-gradient(circle, rgba(129, 140, 248, 0.42), transparent 68%)',
    filter: 'blur(18px)',
  },

  modalHeader: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '20px',
    marginBottom: '24px',
  },

  modalEyebrow: {
    margin: '0 0 9px',
    color: '#a5b4fc',
    fontSize: '12px',
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: '0.9px',
  },

  modalTitle: {
    margin: 0,
    fontSize: '36px',
    lineHeight: 1,
    letterSpacing: '-1.3px',
  },

  modalSubtitle: {
    margin: '10px 0 0',
    color: '#b8bcc6',
    lineHeight: 1.5,
  },

  closeButton: {
    minWidth: '44px',
    height: '44px',
    border: '1px solid rgba(148, 163, 184, 0.14)',
    borderRadius: '6px',
    background: '#121214',
    color: '#f1f1f3',
    fontSize: '25px',
    cursor: 'pointer',
    transition: '0.22s ease',
  },

  modalForm: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '17px',
  },

  modalLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '9px',
    color: 'rgba(226, 232, 240, 0.82)',
    fontSize: '13px',
    fontWeight: 800,
  },

  modalInput: {
    height: '55px',
    borderRadius: '6px',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    background: 'rgba(2, 6, 23, 0.58)',
    color: '#f1f1f3',
    padding: '0 18px',
    fontSize: '15px',
    outline: 'none',
    transition: '0.22s ease',
  },

  textarea: {
    minHeight: '124px',
    resize: 'none',
    borderRadius: '6px',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    background: 'rgba(2, 6, 23, 0.58)',
    color: '#f1f1f3',
    padding: '16px 18px',
    fon
