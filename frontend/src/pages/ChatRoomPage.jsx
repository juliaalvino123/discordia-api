import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import {
  deleteMessage,
  getRoomMembers,
  getRoomMessages,
  joinRoom,
  leaveRoom,
  leaveRoomOnUnload,
} from '../services/roomService'
import {
  acceptChallenge,
  challengeUser,
  declineChallenge,
  submitMove,
} from '../services/gameService'
import {
  clearAuthSession,
  getCurrentUsername,
  getCurrentUserRole,
  getSelectedRoomDescription,
  getSelectedRoomName,
} from '../services/authSession'

import {
  connectWebSocket,
  disconnectWebSocket,
  subscribeToChallengeEvents,
  subscribeToDeletedMessages,
  subscribeToGameResults,
  subscribeToRoom,
  subscribeToRoomMembers,
  subscribeToTyping,
  sendMessage,
  sendTyping,
} from '../services/websocketService'

const RPS_MOVES = [
  { value: 'ROCK', label: 'Pedra' },
  { value: 'PAPER', label: 'Papel' },
  { value: 'SCISSORS', label: 'Tesoura' },
]

function ChatRoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()

  const messagesWrapperRef = useRef(null)
  const messagesEndRef = useRef(null)
  const shouldAutoScrollRef = useRef(true)
  const typingTimeoutRef = useRef(null)
  const isTypingRef = useRef(false)
  const leaveSentRef = useRef(false)
  const canLeaveOnUnmountRef = useRef(false)

  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [members, setMembers] = useState([])
  const [membersError, setMembersError] = useState('')
  const [deletingMessageId, setDeletingMessageId] = useState(null)
  const [openMessageMenuId, setOpenMessageMenuId] = useState(null)
  const [typingUsers, setTypingUsers] = useState([])
  const [selectedOpponentId, setSelectedOpponentId] = useState('')
  const [incomingInvite, setIncomingInvite] = useState(null)
  const [activeGame, setActiveGame] = useState(null)
  const [gameResult, setGameResult] = useState(null)
  const [selectedMove, setSelectedMove] = useState('')
  const [gameFeedback, setGameFeedback] = useState('')
  const [gameLoading, setGameLoading] = useState(false)

  const username = getCurrentUsername() || 'Você'
  const isAdmin = getCurrentUserRole() === 'ADMIN'
  const roomName = getSelectedRoomName()
  const roomDescription = getSelectedRoomDescription()

  function scrollToBottom(behavior = 'smooth') {
    messagesEndRef.current?.scrollIntoView({
      behavior,
      block: 'end',
    })
  }

  const stopTyping = useCallback(() => {
    if (!isTypingRef.current) return

    isTypingRef.current = false
    sendTyping(roomId, false)
  }, [roomId])

  const leaveCurrentRoom = useCallback(async ({ keepalive = false } = {}) => {
    if (leaveSentRef.current) return

    leaveSentRef.current = true

    if (keepalive) {
      leaveRoomOnUnload(roomId)
      return
    }

    try {
      await leaveRoom(roomId)
    } catch (error) {
      leaveSentRef.current = false
      throw error
    }
  }, [roomId])

  useEffect(() => {
    leaveSentRef.current = false
    canLeaveOnUnmountRef.current = false

    const canLeaveTimeout = window.setTimeout(() => {
      canLeaveOnUnmountRef.current = true
    }, 0)
    let confirmJoinTimeout = null

    async function loadMessages() {
      try {
        setLoading(true)
        setErrorMessage('')

        const data = await getRoomMessages(roomId)

        setMessages([...data.content].reverse())

        setTimeout(() => {
          scrollToBottom('auto')
        }, 100)
      } catch (error) {
        console.error(error)
        setErrorMessage('Não foi possível carregar as mensagens.')
      } finally {
        setLoading(false)
      }
    }

    async function loadMembers() {
      try {
        setMembersError('')
        const data = await getRoomMembers(roomId)
        setMembers(data)
      } catch (error) {
        console.error(error)
        setMembersError('Não foi possível carregar os membros.')
      }
    }

    async function prepareRoom() {
      try {
        await joinRoom(roomId)
      } catch (error) {
        console.error(error)
        setErrorMessage(
          error.response?.data?.message || 'NÃ£o foi possÃ­vel entrar na sala.'
        )
        setLoading(false)
        return
      }

      loadMessages()
      loadMembers()

      confirmJoinTimeout = window.setTimeout(() => {
        joinRoom(roomId).catch((error) => {
          console.error(error)
        })
      }, 800)
    }

    function handlePageHide() {
      leaveCurrentRoom({ keepalive: true })
    }

    prepareRoom()
    window.addEventListener('pagehide', handlePageHide)

    const client = connectWebSocket()

    client.onConnect = () => {
      subscribeToRoom(roomId, (message) => {
        setMessages((previousMessages) => [
          ...previousMessages,
          message,
        ])
      })

      subscribeToTyping(roomId, (event) => {
        if (event.username === username) return

        setTypingUsers((previousUsers) => {
          if (event.typing) {
            return previousUsers.includes(event.username)
              ? previousUsers
              : [...previousUsers, event.username]
          }

          return previousUsers.filter((user) => user !== event.username)
        })
      })

      subscribeToDeletedMessages(roomId, (event) => {
        setMessages((previousMessages) =>
          previousMessages.filter((message) => message.id !== event.messageId)
        )
      })

      subscribeToRoomMembers(roomId, (roomMembers) => {
        setMembers(roomMembers)
        setMembersError('')
      })

      subscribeToChallengeEvents((event) => {
        if (event.roomId && event.roomId !== roomId) return

        if (typeof event.accepted === 'boolean') {
          if (event.accepted) {
            setActiveGame({
              roundId: event.roundId,
              roomId: event.roomId,
              challengerUsername: event.challengerUsername,
              challengedUsername: event.respondentUsername,
              status: 'IN_PROGRESS',
            })
            setGameResult(null)
            setGameFeedback(`${event.respondentUsername} aceitou o desafio.`)
            return
          }

          setActiveGame(null)
          setGameFeedback(`${event.respondentUsername} recusou o desafio.`)
          return
        }

        setIncomingInvite(event)
        setGameFeedback('')
      })

      subscribeToGameResults((event) => {
        if (event.roomId !== roomId) return

        setActiveGame({
          roundId: event.roundId,
          roomId: event.roomId,
          challengerUsername: event.challengerUsername,
          challengedUsername: event.challengedUsername,
          status: event.status,
        })

        if (event.status === 'FINISHED') {
          setGameResult(event)
          setGameFeedback('')
          return
        }

        setGameFeedback('Jogada enviada. Aguardando o outro jogador.')
      })
    }

    return () => {
      window.clearTimeout(canLeaveTimeout)
      window.clearTimeout(confirmJoinTimeout)
      window.removeEventListener('pagehide', handlePageHide)
      window.clearTimeout(typingTimeoutRef.current)
      stopTyping()
      disconnectWebSocket()

      if (canLeaveOnUnmountRef.current) {
        leaveCurrentRoom().catch((error) => {
          console.error(error)
        })
      }
    }
  }, [leaveCurrentRoom, roomId, stopTyping, username])

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom('smooth')
    }
  }, [messages])

  function handleMessagesScroll() {
    const container = messagesWrapperRef.current

    if (!container) return

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight

    shouldAutoScrollRef.current = distanceFromBottom < 120
  }

  function handleSendMessage(event) {
    event.preventDefault()

    if (!newMessage.trim()) return

    shouldAutoScrollRef.current = true

    sendMessage(roomId, newMessage)
    stopTyping()
    setNewMessage('')
  }

  function handleMessageChange(event) {
    const value = event.target.value
    setNewMessage(value)

    if (!value.trim()) {
      window.clearTimeout(typingTimeoutRef.current)
      stopTyping()
      return
    }

    if (!isTypingRef.current) {
      isTypingRef.current = true
      sendTyping(roomId, true)
    }

    window.clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = window.setTimeout(() => {
      stopTyping()
    }, 1200)
  }

  async function handleDeleteMessage(message) {
    const confirmed = window.confirm(
      'Tem certeza que deseja excluir essa mensagem? Essa ação não pode ser desfeita.'
    )

    if (!confirmed) return

    try {
      setDeletingMessageId(message.id)
      setOpenMessageMenuId(null)
      await deleteMessage(message.id)
      setMessages((previousMessages) =>
        previousMessages.filter((currentMessage) => currentMessage.id !== message.id)
      )
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error.response?.status === 403
          ? 'Você não tem permissão para excluir essa mensagem.'
          : 'Não foi possível excluir essa mensagem.'
      )
    } finally {
      setDeletingMessageId(null)
    }
  }

  async function handleChallengeUser() {
    if (!selectedOpponentId) {
      setGameFeedback('Escolha um membro da sala para desafiar.')
      return
    }

    try {
      setGameLoading(true)
      setGameFeedback('')
      const challenge = await challengeUser(roomId, selectedOpponentId)
      setActiveGame(challenge)
      setGameResult(null)
      setSelectedMove('')
      setGameFeedback('Desafio enviado. Aguardando resposta.')
    } catch (error) {
      console.error(error)
      setGameFeedback(
        error.response?.data?.message || 'Não foi possível enviar o desafio.'
      )
    } finally {
      setGameLoading(false)
    }
  }

  async function handleAcceptChallenge() {
    if (!incomingInvite) return

    try {
      setGameLoading(true)
      const challenge = await acceptChallenge(incomingInvite.roundId)
      setActiveGame(challenge)
      setIncomingInvite(null)
      setGameResult(null)
      setSelectedMove('')
      setGameFeedback('Desafio aceito. Escolha sua jogada.')
    } catch (error) {
      console.error(error)
      setGameFeedback(
        error.response?.data?.message || 'Não foi possível aceitar o desafio.'
      )
    } finally {
      setGameLoading(false)
    }
  }

  async function handleDeclineChallenge() {
    if (!incomingInvite) return

    try {
      setGameLoading(true)
      await declineChallenge(incomingInvite.roundId)
      setIncomingInvite(null)
      setGameFeedback('Desafio recusado.')
    } catch (error) {
      console.error(error)
      setGameFeedback(
        error.response?.data?.message || 'Não foi possível recusar o desafio.'
      )
    } finally {
      setGameLoading(false)
    }
  }

  async function handleSubmitMove(move) {
    if (!activeGame || activeGame.status !== 'IN_PROGRESS' || selectedMove) return

    try {
      setGameLoading(true)
      setSelectedMove(move)
      setGameFeedback('Jogada enviada. Aguardando o outro jogador.')
      await submitMove(activeGame.roundId, move)
    } catch (error) {
      console.error(error)
      setSelectedMove('')
      setGameFeedback(
        error.response?.data?.message || 'Não foi possível enviar sua jogada.'
      )
    } finally {
      setGameLoading(false)
    }
  }

  function closeGamePanel() {
    setActiveGame(null)
    setGameResult(null)
    setSelectedMove('')
  }

  async function handleBackToRooms() {
    try {
      await leaveCurrentRoom()
    } catch (error) {
      console.error(error)
    } finally {
      navigate('/rooms')
    }
  }

  async function handleLogout() {
    try {
      await leaveCurrentRoom()
    } catch (error) {
      console.error(error)
    } finally {
      clearAuthSession()
      navigate('/')
    }
  }

  function formatTime(dateString) {
    if (!dateString) return ''

    return new Date(dateString).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getInitials(name) {
    if (!name) return '?'

    return name.charAt(0).toUpperCase()
  }

  function getMoveLabel(move) {
    return RPS_MOVES.find((option) => option.value === move)?.label || '-'
  }

  function getGameOutcomeText() {
    if (!gameResult || gameResult.status !== 'FINISHED') return ''
    if (!gameResult.winnerUsername) return 'Empate'
    return gameResult.winnerUsername === username ? 'Vitória' : 'Derrota'
  }

  function getGameOpponentName() {
    if (!activeGame) return ''
    return activeGame.challengerUsername === username
      ? activeGame.challengedUsername
      : activeGame.challengerUsername
  }

  return (
    <div className="chat-app" style={styles.app}>
      <style>
        {`
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

          @keyframes messageAppear {
            from {
              opacity: 0;
              transform: translateY(8px) scale(0.98);
            }

            to {
              opacity: 1;
              transform: translateY(0) scale(1);
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

          .chat-scroll::-webkit-scrollbar {
            width: 10px;
          }

          .chat-scroll::-webkit-scrollbar-track {
            background: #121214;
          }

          .chat-scroll::-webkit-scrollbar-thumb {
            background: #34363b;
            border-radius: 999px;
          }

          .chat-scroll::-webkit-scrollbar-thumb:hover {
            background: #3b82f6;
          }

          .chat-button:hover,
          .chat-back-button:hover,
          .chat-logout-button:hover,
          .chat-server-button:hover {
            transform: translateY(-1px);
            filter: brightness(1.08);
          }

          .chat-send-button:hover {
            transform: translateY(-1px);
            box-shadow: none;
            filter: brightness(1.08);
          }

          .chat-input::placeholder {
            color: rgba(203, 213, 225, 0.45);
          }

          .chat-input:focus {
            border-color: #3b82f6 !important;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18) !important;
            background: #121214 !important;
          }

          .chat-message:hover {
            transform: translateY(-2px);
            box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28) !important;
          }

          .chat-message button:hover {
            background: rgba(15, 23, 42, 0.62) !important;
            color: #ffffff !important;
          }

          .chat-channel-item:hover {
            background: #202226 !important;
            color: #ffffff !important;
          }

          @media (max-width: 1180px) {
            .chat-app {
              grid-template-columns: 260px 1fr !important;
            }

            .chat-app > aside:last-child {
              display: none !important;
            }
          }

          @media (max-width: 920px) {
            .chat-app {
              grid-template-columns: 1fr !important;
            }

            .chat-app > aside:first-of-type {
              display: none !important;
            }
          }

          @media (max-height: 760px) {
            .chat-scroll {
              padding-block: 20px !important;
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
            onClick={handleBackToRooms}
            title="Voltar para salas"
          >
            <span style={styles.logoInitial}>D</span>
            <span style={styles.logoText}>iscordia</span>
          </button>

          <button
            className="chat-logout-button"
            style={styles.logoutButton}
            onClick={handleLogout}
          >
            Sair
          </button>
        </div>

        <div style={styles.roomCard}>
          <div style={styles.roomIcon}>#</div>

          <div style={styles.roomInfo}>
            <strong style={styles.roomName}>{roomName}</strong>

            <div style={styles.onlineRow}>
              <span style={styles.onlineDot} />
              <p style={styles.onlineText}>ao vivo</p>
            </div>
          </div>
        </div>

        <div style={styles.profileCard}>
          <div style={styles.profileAvatar}>
            {getInitials(username)}
          </div>

          <div style={styles.profileInfo}>
            <strong style={styles.profileName}>{username}</strong>

            <div style={styles.onlineRow}>
              <span style={styles.onlineDot} />
              <p style={styles.onlineText}>online</p>
            </div>
          </div>
        </div>
      </aside>

      <main style={styles.chatContainer}>
        <header style={styles.chatHeader}>
          <div style={styles.chatHeaderLeft}>
            <div style={styles.headerRoomIcon}>#</div>

            <div>
              <h2 style={styles.chatTitle}>{roomName}</h2>

              {roomDescription && (
                <p style={styles.chatSubtitle}>{roomDescription}</p>
              )}
            </div>
          </div>

          <button
            className="chat-back-button"
            style={styles.backButton}
            onClick={handleBackToRooms}
          >
            Voltar
          </button>
        </header>

        <div
          ref={messagesWrapperRef}
          className="chat-scroll"
          style={styles.messagesWrapper}
          onScroll={handleMessagesScroll}
        >
          {loading && (
            <div style={styles.centerState}>
              <div style={styles.loadingIcon}>#</div>
              <p>Carregando mensagens...</p>
            </div>
          )}

          {!loading && errorMessage && (
            <div style={styles.errorState}>
              {errorMessage}
            </div>
          )}

          {!loading && !errorMessage && messages.length === 0 && (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>#</div>

              <h2 style={styles.emptyTitle}>
                Bem-vindo ao #{roomName}
              </h2>

              <p style={styles.emptyText}>
                Esse é o começo da conversa.
              </p>
            </div>
          )}

          {!loading &&
            messages.map((message, index) => {
              const isMine = message.senderUsername === username
              const canDeleteMessage = isAdmin || isMine

              return (
                <div
                  key={message.id || index}
                  style={{
                    ...styles.messageRow,
                    justifyContent: isMine ? 'flex-end' : 'flex-start',
                  }}
                >
                  {!isMine && (
                    <div style={styles.avatar}>
                      {getInitials(message.senderUsername)}
                    </div>
                  )}

                  <div
                    className="chat-message"
                    style={{
                      ...styles.messageBubble,
                      ...(isMine ? styles.myMessage : styles.otherMessage),
                    }}
                  >
                    <div style={styles.messageMeta}>
                      <strong style={styles.messageAuthor}>
                        {message.senderUsername}
                      </strong>

                      <span style={styles.messageTime}>
                        {formatTime(message.sentAt)}
                      </span>
                    </div>

                    <p style={styles.messageContent}>
                      {message.content}
                    </p>

                  </div>

                  {canDeleteMessage && message.id && (
                    <div style={styles.messageMenuWrapper}>
                      <button
                        type="button"
                        style={styles.messageMenuButton}
                        onClick={() =>
                          setOpenMessageMenuId((currentId) =>
                            currentId === message.id ? null : message.id
                          )
                        }
                        title="Opções da mensagem"
                      >
                        ⋯
                      </button>

                      {openMessageMenuId === message.id && (
                        <div
                          style={{
                            ...styles.messageMenu,
                            ...(isMine
                              ? styles.myMessageMenu
                              : styles.otherMessageMenu),
                          }}
                        >
                          <button
                            type="button"
                            style={{
                              ...styles.messageMenuItem,
                              opacity:
                                deletingMessageId === message.id ? 0.55 : 1,
                              cursor:
                                deletingMessageId === message.id
                                  ? 'not-allowed'
                                  : 'pointer',
                            }}
                            onClick={() => handleDeleteMessage(message)}
                            disabled={deletingMessageId === message.id}
                          >
                            {deletingMessageId === message.id
                              ? 'Excluindo...'
                              : 'Excluir'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

          <div ref={messagesEndRef} />
        </div>

        {typingUsers.length > 0 && (
          <div style={styles.typingIndicator}>
            {typingUsers.length === 1
              ? `${typingUsers[0]} está digitando...`
              : `${typingUsers.slice(0, 2).join(', ')} estão digitando...`}
          </div>
        )}

        <form
          style={styles.inputContainer}
          onSubmit={handleSendMessage}
        >
          <button
            className="chat-button"
            type="button"
            style={styles.plusButton}
            title="Anexos em breve"
          >
            +
          </button>

          <input
            className="chat-input"
            type="text"
            placeholder={`Conversar em #${roomName}`}
            value={newMessage}
            onChange={handleMessageChange}
            style={styles.input}
          />

          <button
            className="chat-send-button"
            type="submit"
            style={{
              ...styles.sendButton,
              opacity: newMessage.trim() ? 1 : 0.6,
              cursor: newMessage.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Enviar
          </button>
        </form>
      </main>

      <aside style={styles.rightPanel}>
        <div style={styles.rightHeader}>
          <h3 style={styles.rightTitle}>Membros da sala</h3>
          <span style={styles.memberCount}>{members.length}</span>
        </div>

        {membersError && (
          <div style={styles.memberError}>{membersError}</div>
        )}

        <div style={styles.membersList}>
          {members.map((member) => (
            <div key={member.id || member.username} style={styles.memberCard}>
              <div style={styles.memberAvatar}>
                {getInitials(member.username)}
              </div>

              <div style={styles.memberInfo}>
                <strong style={styles.memberName}>{member.username}</strong>

                <div style={styles.onlineRow}>
                  <span style={styles.onlineDot} />
                  <p style={styles.memberStatus}>
                    {member.role === 'ADMIN' ? 'Admin' : 'Membro'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={styles.gameCard}>
          <div style={styles.gameGlow} />

          <div style={styles.gameIcon}>✦</div>

          <h2 style={styles.gameTitle}>
            Pedra, Papel e Tesoura
          </h2>

          <p style={styles.gameText}>
            Escolha um membro da sala e envie um desafio em tempo real.
          </p>

          {incomingInvite && (
            <div style={styles.gameInviteCard}>
              <strong>{incomingInvite.challengerUsername}</strong>
              <span>te desafiou para jogar.</span>

              <div style={styles.gameInviteActions}>
                <button
                  style={styles.acceptGameButton}
                  onClick={handleAcceptChallenge}
                  disabled={gameLoading}
                >
                  Aceitar
                </button>

                <button
                  style={styles.declineGameButton}
                  onClick={handleDeclineChallenge}
                  disabled={gameLoading}
                >
                  Recusar
                </button>
              </div>
            </div>
          )}

          <select
            value={selectedOpponentId}
            onChange={(event) => setSelectedOpponentId(event.target.value)}
            style={styles.gameSelect}
            disabled={gameLoading || Boolean(activeGame)}
          >
            <option value="">Escolher jogador</option>
            {members
              .filter((member) => member.username !== username)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.username}
                </option>
              ))}
          </select>

          <button
            style={{
              ...styles.gameButton,
              opacity: gameLoading || activeGame ? 0.62 : 1,
              cursor: gameLoading || activeGame ? 'not-allowed' : 'pointer',
            }}
            onClick={handleChallengeUser}
            disabled={gameLoading || Boolean(activeGame)}
          >
            {gameLoading
              ? 'Enviando...'
              : activeGame?.status === 'WAITING'
                ? 'Aguardando resposta'
                : 'Desafiar'}
          </button>

          {gameFeedback && (
            <p style={styles.gameFeedback}>{gameFeedback}</p>
          )}
        </div>
      </aside>

      {activeGame && activeGame.status !== 'WAITING' && (
        <div style={styles.gameModalOverlay}>
          <div style={styles.gameModal}>
            <div style={styles.gameModalHeader}>
              <div>
                <p style={styles.gameModalEyebrow}>Partida realtime</p>
                <h2 style={styles.gameModalTitle}>
                  {getGameOutcomeText() || 'Pedra, Papel e Tesoura'}
                </h2>
                <p style={styles.gameModalSubtitle}>
                  Contra {getGameOpponentName()}
                </p>
              </div>

              <button
                style={styles.gameModalClose}
                onClick={closeGamePanel}
                title="Fechar jogo"
              >
                ×
              </button>
            </div>

            <div style={styles.movesGrid}>
              {RPS_MOVES.map((move) => (
                <button
                  key={move.value}
                  style={{
                    ...styles.moveButton,
                    ...(selectedMove === move.value
                      ? styles.selectedMoveButton
                      : {}),
                  }}
                  onClick={() => handleSubmitMove(move.value)}
                  disabled={
                    gameLoading ||
                    activeGame.status !== 'IN_PROGRESS' ||
                    Boolean(selectedMove) ||
                    gameResult?.status === 'FINISHED'
                  }
                >
                  {move.label}
                </button>
              ))}
            </div>

            {selectedMove && (
              <p style={styles.gameModalStatus}>
                Você escolheu {getMoveLabel(selectedMove)}.
              </p>
            )}

            {gameResult?.status === 'FINISHED' ? (
              <div style={styles.resultCard}>
                <div style={styles.resultRow}>
                  <span>{gameResult.challengerUsername}</span>
                  <strong>{getMoveLabel(gameResult.challengerMove)}</strong>
                </div>

                <div style={styles.resultRow}>
                  <span>{gameResult.challengedUsername}</span>
                  <strong>{getMoveLabel(gameResult.challengedMove)}</strong>
                </div>
              </div>
            ) : (
              <p style={styles.gameModalStatus}>
                {gameFeedback || 'Escolha sua jogada.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  app: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: '292px 1fr 310px',
    width: '100%',
    height: '100vh',
    background:
      '#121214',
    overflow: 'hidden',
    color: '#f1f1f3',
  },

  backgroundOrbOne: {
    display: 'none',
    position: 'absolute',
    width: '340px',
    height: '340px',
    borderRadius: '999px',
    background: 'transparent',
    filter: 'blur(88px)',
    top: '-120px',
    left: '190px',
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
    right: '-90px',
    animation: 'floatGlow 10s ease-in-out infinite',
    pointerEvents: 'none',
  },

  backgroundOrbThree: {
    display: 'none',
    position: 'absolute',
    width: '260px',
    height: '260px',
    borderRadius: '999px',
    background: 'rgba(34, 211, 238, 0.08)',
    filter: 'blur(80px)',
    top: '44%',
    left: '52%',
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
    transition: '0.22s ease',
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
  },

  sidebarHeader: {
    minHeight: '86px',
    padding: '0 20px',
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

  logoutButton: {
    height: '38px',
    padding: '0 13px',
    border: '1px solid rgba(148, 163, 184, 0.14)',
    borderRadius: '6px',
    background: '#121214',
    color: '#f1f1f3',
    fontWeight: '800',
    cursor: 'pointer',
    transition: '0.22s ease',
  },

  roomCard: {
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

  roomIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '6px',
    background: '#3b82f6',
    display: 'grid',
    placeItems: 'center',
    fontSize: '24px',
    fontWeight: 950,
    boxShadow: 'none',
  },

  roomInfo: {
    minWidth: 0,
  },

  roomName: {
    display: 'block',
    maxWidth: '180px',
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

  profileCard: {
    marginTop: 'auto',
    minHeight: '78px',
    padding: '14px 18px',
    background: 'rgba(2, 6, 23, 0.58)',
    borderTop: '1px solid rgba(148, 163, 184, 0.12)',
    display: 'flex',
    alignItems: 'center',
    gap: '13px',
  },

  profileAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: '6px',
    background: '#2563eb',
    display: 'grid',
    placeItems: 'center',
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

  chatContainer: {
    position: 'relative',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },

  chatHeader: {
    minHeight: '86px',
    padding: '0 28px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
    background: '#1a1b1e',
    backdropFilter: 'blur(18px)',
  },

  chatHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    minWidth: 0,
  },

  headerRoomIcon: {
    width: '46px',
    height: '46px',
    borderRadius: '6px',
    background: '#18191c',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    display: 'grid',
    placeItems: 'center',
    color: '#a5b4fc',
    fontSize: '24px',
    fontWeight: 950,
  },

  chatTitle: {
    margin: 0,
    fontSize: '27px',
    fontWeight: '950',
    letterSpacing: '-0.8px',
  },

  chatSubtitle: {
    maxWidth: '640px',
    margin: '5px 0 0',
    color: '#8a9099',
    fontSize: '14px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  backButton: {
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

  messagesWrapper: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  centerState: {
    margin: 'auto',
    minWidth: '280px',
    minHeight: '210px',
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
    margin: 'auto',
    textAlign: 'center',
    color: 'rgba(203, 213, 225, 0.64)',
    padding: '34px',
  },

  errorState: {
    margin: 'auto',
    maxWidth: '360px',
    padding: '14px 16px',
    borderRadius: '6px',
    background: 'rgba(248, 113, 113, 0.12)',
    border: '1px solid rgba(248, 113, 113, 0.22)',
    color: '#fecaca',
    fontSize: '14px',
    fontWeight: 800,
    textAlign: 'center',
  },

  emptyIcon: {
    width: '88px',
    height: '88px',
    margin: '0 auto 24px',
    borderRadius: '8px',
    background: '#2563eb',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '42px',
    fontWeight: 950,
    boxShadow: 'none',
  },

  emptyTitle: {
    margin: 0,
    color: '#f1f1f3',
    fontSize: '30px',
    letterSpacing: '-1px',
  },

  emptyText: {
    marginTop: '10px',
    lineHeight: 1.6,
  },

  messageRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
    animation: 'messageAppear 0.22s ease',
  },

  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '6px',
    background:
      'linear-gradient(135deg, rgba(129, 140, 248, 0.8), rgba(34, 211, 238, 0.72))',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: '900',
    color: '#f1f1f3',
    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.22)',
  },

  messageBubble: {
    position: 'relative',
    maxWidth: '66%',
    padding: '14px 16px',
    borderRadius: '8px',
    boxShadow: '0 12px 34px rgba(0, 0, 0, 0.2)',
    backdropFilter: 'blur(12px)',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
  },

  myMessage: {
    background: '#3b82f6',
    borderBottomRightRadius: '7px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },

  otherMessage: {
    background: '#1a1b1e',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    borderBottomLeftRadius: '7px',
  },

  messageMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
    fontSize: '13px',
  },

  messageAuthor: {
    color: '#f1f1f3',
  },

  messageTime: {
    color: 'rgba(226, 232, 240, 0.55)',
    fontSize: '12px',
    fontWeight: 700,
  },

  messageContent: {
    margin: 0,
    lineHeight: 1.55,
    fontSize: '15px',
    color: 'rgba(248, 250, 252, 0.92)',
    wordBreak: 'break-word',
  },

  messageMenuWrapper: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginTop: '2px',
  },

  messageMenuButton: {
    width: '30px',
    height: '30px',
    borderRadius: '10px',
    background: 'rgba(2, 6, 23, 0.28)',
    color: 'rgba(248, 250, 252, 0.72)',
    fontSize: '18px',
    lineHeight: 1,
    fontWeight: 900,
    display: 'grid',
    placeItems: 'center',
    transition: '0.18s ease',
  },

  messageMenu: {
    position: 'absolute',
    top: '34px',
    minWidth: '118px',
    padding: '6px',
    borderRadius: '6px',
    background: 'rgba(2, 6, 23, 0.94)',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    boxShadow: '0 18px 42px rgba(0, 0, 0, 0.34)',
    backdropFilter: 'blur(16px)',
    zIndex: 5,
  },

  myMessageMenu: {
    right: 0,
  },

  otherMessageMenu: {
    left: 0,
  },

  messageMenuItem: {
    width: '100%',
    height: '34px',
    borderRadius: '9px',
    background: 'transparent',
    color: '#fecaca',
    fontSize: '13px',
    fontWeight: 900,
    textAlign: 'left',
    padding: '0 10px',
    transition: '0.18s ease',
  },

  typingIndicator: {
    minHeight: '28px',
    padding: '0 28px 4px',
    color: '#b8bcc6',
    fontSize: '13px',
    fontWeight: 800,
  },

  inputContainer: {
    padding: '18px 24px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    borderTop: '1px solid rgba(148, 163, 184, 0.08)',
    background: 'rgba(15, 23, 42, 0.42)',
    backdropFilter: 'blur(16px)',
  },

  plusButton: {
    width: '50px',
    height: '50px',
    border: '1px solid rgba(148, 163, 184, 0.14)',
    borderRadius: '6px',
    background: '#121214',
    color: '#f1f1f3',
    fontSize: '28px',
    cursor: 'pointer',
    transition: '0.22s ease',
  },

  input: {
    flex: 1,
    height: '54px',
    background: 'rgba(2, 6, 23, 0.58)',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    borderRadius: '6px',
    padding: '0 20px',
    color: '#f1f1f3',
    fontSize: '15px',
    outline: 'none',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
    transition: '0.22s ease',
  },

  sendButton: {
    height: '54px',
    padding: '0 26px',
    border: 'none',
    borderRadius: '6px',
    background: '#3b82f6',
    color: 'white',
    fontWeight: '950',
    letterSpacing: '0.3px',
    boxShadow: 'none',
    transition: '0.18s ease',
  },

  rightPanel: {
    background: '#121214', 
    borderLeft: '1px solid rgba(148, 163, 184, 0.12)',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden', 
    
  },

  rightHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
  },

  rightTitle: {
    margin: 0,
    color: '#8a9099',
    fontSize: '12px',
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },

  memberCount: {
    minWidth: '26px',
    height: '26px',
    borderRadius: '999px',
    background: '#121214',
    color: '#c7d2fe',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 900,
    fontSize: '12px',
  },

  memberCard: {
    background: '#202226',
    border: '1px solid #34363b',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '13px',
    marginBottom: '22px',
    boxShadow: 'none',
  },

membersList: {
    flex: 1,             
    overflowY: 'auto',   
    padding: '12px',    
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',

  },

  memberError: {
    marginBottom: '14px',
    padding: '12px 14px',
    borderRadius: '6px',
    background: 'rgba(248, 113, 113, 0.12)',
    border: '1px solid rgba(248, 113, 113, 0.22)',
    color: '#fecaca',
    fontSize: '13px',
    fontWeight: 800,
  },

  memberAvatar: {
    width: '46px',
    height: '46px',
    borderRadius: '6px',
    background: '#22c55e',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: '900',
  },

  memberInfo: {
    minWidth: 0,
  },

  memberName: {
    display: 'block',
    maxWidth: '180px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  memberStatus: {
    margin: 0,
    color: '#86efac',
    fontSize: '13px',
    fontWeight: 700,
  },

  gameCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: '8px',
    padding: '22px',
    background: '#202226',
    border: '1px solid #34363b',
    boxShadow: 'none',
  },

  gameGlow: {
    display: 'none',
    position: 'absolute',
    top: '-56px',
    right: '-52px',
    width: '150px',
    height: '150px',
    borderRadius: '50%',
    background:
      'transparent',
    filter: 'blur(16px)',
  },

  gameIcon: {
    position: 'relative',
    zIndex: 1,
    width: '44px',
    height: '44px',
    borderRadius: '6px',
    background: '#2563eb',
    display: 'grid',
    placeItems: 'center',
    color: '#f1f1f3',
    fontWeight: 950,
    marginBottom: '18px',
    boxShadow: 'none',
  },

  gameTitle: {
    position: 'relative',
    zIndex: 1,
    margin: 0,
    fontSize: '28px',
    lineHeight: 1.08,
    letterSpacing: '-1px',
  },

  gameText: {
    position: 'relative',
    zIndex: 1,
    color: '#b8bcc6',
    lineHeight: 1.6,
    margin: '12px 0 18px',
    fontSize: '14px',
  },

  gameInviteCard: {
    position: 'relative',
    zIndex: 1,
    display: 'grid',
    gap: '6px',
    padding: '13px',
    borderRadius: '6px',
    background: '#121214',
    border: '1px solid #34363b',
    color: '#b8bcc6',
    fontSize: '13px',
    marginBottom: '14px',
  },

  gameInviteActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '6px',
  },

  acceptGameButton: {
    flex: 1,
    height: '34px',
    borderRadius: '11px',
    background: '#22c55e',
    color: '#f1f1f3',
    fontWeight: 900,
  },

  declineGameButton: {
    flex: 1,
    height: '34px',
    borderRadius: '11px',
    background: 'rgba(127, 29, 29, 0.26)',
    color: '#fecaca',
    fontWeight: 900,
    border: '1px solid rgba(248, 113, 113, 0.2)',
  },

  gameSelect: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    height: '42px',
    borderRadius: '6px',
    border: '1px solid #34363b',
    background: '#121214',
    color: '#f1f1f3',
    padding: '0 12px',
    fontWeight: 800,
    outline: 'none',
    marginBottom: '10px',
  },

  gameButton: {
    position: 'relative',
    zIndex: 1,
    height: '42px',
    width: '100%',
    padding: '0 16px',
    border: 'none',
    borderRadius: '6px',
    background: '#3b82f6',
    color: '#f1f1f3',
    fontWeight: 900,
    boxShadow: 'none',
  },

  gameFeedback: {
    position: 'relative',
    zIndex: 1,
    margin: '12px 0 0',
    color: '#b8bcc6',
    fontSize: '13px',
    lineHeight: 1.5,
    fontWeight: 800,
  },

  gameModalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 80,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '24px',
    background: 'rgba(2, 6, 23, 0.72)',
    backdropFilter: 'blur(10px)',
  },

  gameModal: {
    width: '100%',
    maxWidth: '460px',
    borderRadius: '8px',
    padding: '24px',
    background:
      '#1a1b1e',
    border: '1px solid #34363b',
    boxShadow: '0 18px 48px rgba(0, 0, 0, 0.32)',
  },

  gameModalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '18px',
    alignItems: 'flex-start',
    marginBottom: '20px',
  },

  gameModalEyebrow: {
    margin: 0,
    color: '#60a5fa',
    fontSize: '12px',
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },

  gameModalTitle: {
    margin: '6px 0 0',
    color: '#f1f1f3',
    fontSize: '31px',
    lineHeight: 1.06,
  },

  gameModalSubtitle: {
    margin: '8px 0 0',
    color: '#b8bcc6',
    fontSize: '14px',
  },

  gameModalClose: {
    minWidth: '40px',
    height: '40px',
    borderRadius: '6px',
    background: '#121214',
    color: '#f1f1f3',
    border: '1px solid #34363b',
    fontSize: '24px',
  },

  movesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
  },

  moveButton: {
    minHeight: '78px',
    borderRadius: '6px',
    background: '#121214',
    border: '1px solid #34363b',
    color: '#f1f1f3',
    fontWeight: 950,
    fontSize: '15px',
  },

  selectedMoveButton: {
    background: '#3b82f6',
    borderColor: '#60a5fa',
    boxShadow: 'none',
  },

  gameModalStatus: {
    margin: '16px 0 0',
    color: '#b8bcc6',
    fontSize: '14px',
    fontWeight: 800,
    textAlign: 'center',
  },

  resultCard: {
    display: 'grid',
    gap: '10px',
    marginTop: '18px',
  },

  resultRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    padding: '12px 14px',
    borderRadius: '6px',
    background: '#121214',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    color: 'rgba(226, 232, 240, 0.78)',
  },
}

export default ChatRoomPage
