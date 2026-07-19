'use client';

export interface PermissionMatrixProps {
  roles: string[];
  resources: string[];
  matrix: Record<string, Record<string, boolean>>;
}

export function PermissionMatrix({ roles, resources, matrix }: PermissionMatrixProps) {
  return (
    <div className="mc-card" style={{ overflowX: 'auto' }}>
      <span className="mc-label" style={{ display: 'block', marginBottom: '12px' }}>
        Permission Matrix
      </span>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: 'left',
                padding: '4px 8px',
                color: 'var(--muted)',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              Resource
            </th>
            {roles.map((role) => (
              <th
                key={role}
                style={{
                  padding: '4px 8px',
                  color: 'var(--muted)',
                  fontWeight: 500,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {role}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resources.map((resource, i) => (
            <tr
              key={resource}
              style={{ background: i % 2 === 0 ? 'transparent' : 'var(--card-border)' }}
            >
              <td
                style={{
                  padding: '5px 8px',
                  color: 'var(--fg)',
                  whiteSpace: 'nowrap',
                  fontWeight: 500,
                }}
              >
                {resource}
              </td>
              {roles.map((role) => {
                const granted = matrix[role]?.[resource] ?? false;
                return (
                  <td key={role} style={{ padding: '5px 8px', textAlign: 'center' }}>
                    <span style={{ color: granted ? '#22c55e' : '#ef444444', fontSize: '14px' }}>
                      {granted ? '✓' : '–'}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
