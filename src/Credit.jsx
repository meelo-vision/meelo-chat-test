import React from 'react'

// Who a recipe is by. An imported recipe credits its creator (original_author:
// someone without a Meelo account) and has no Meelo author; any other recipe
// shows its Meelo author card. Both can be given; the credit wins.
export default function Credit({ author, original, handle, displayName, compact = false }) {
  if (original) {
    const site = original.site_name || original.site
    return (
      <div className={`credit ${compact ? 'compact' : ''}`}>
        <span className="credit-tag web">Original</span>
        <span>
          By{' '}
          {original.name ? <b>{original.name}</b> : null}
          {original.name && site ? ' · ' : ''}
          {original.url ? (
            <a href={original.url} target="_blank" rel="noreferrer">
              {site || 'source'} ↗
            </a>
          ) : (
            site
          )}
        </span>
      </div>
    )
  }
  const name = author?.display_name || [author?.first_name, author?.last_name].filter(Boolean).join(' ') || displayName
  const user = author?.user_name || handle
  if (!name && !user) {
    return compact ? null : <div className="credit muted small">No author</div>
  }
  const avatar = author?.image?.url
  return (
    <div className={`credit ${compact ? 'compact' : ''}`}>
      <span className="credit-tag meelo">Meelo</span>
      {avatar ? <img className="credit-avatar" src={avatar} alt="" /> : <span className="credit-avatar blank">{(name || user || '?')[0]}</span>}
      <span>
        {name && <b>{name}</b>} {user && <span className="muted">@{user}</span>}
      </span>
    </div>
  )
}
