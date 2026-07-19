'use client';

import { useState } from 'react';
import { useDepartments, useTeams, useApiClient, useOrganizationId } from '../../../lib/api';
import type { Department, Team } from '../../../lib/api';

function DeptCard({
  dept,
  onSelect,
  selected,
}: {
  dept: Department;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  return (
    <button
      onClick={() => {
        onSelect(dept.id);
      }}
      style={{
        width: '100%',
        textAlign: 'left',
        background: selected ? 'rgba(99,102,241,0.12)' : 'var(--mc-card)',
        border: selected ? '2px solid #6366f1' : '1px solid var(--mc-border)',
        borderRadius: '10px',
        padding: '14px 18px',
        cursor: 'pointer',
        color: 'var(--fg)',
      }}
    >
      <div style={{ fontSize: '14px', fontWeight: 700 }}>{dept.name}</div>
      {dept.description && (
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>
          {dept.description}
        </div>
      )}
      <div style={{ fontSize: '11px', color: '#818cf8', marginTop: '4px' }}>
        {dept.memberCount ?? 0} members
      </div>
    </button>
  );
}

function TeamRow({ team }: { team: Team }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: 'var(--mc-card)',
        border: '1px solid var(--mc-border)',
        borderRadius: '8px',
      }}
    >
      <div style={{ fontSize: '20px' }}>👥</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>{team.name}</div>
        {team.description && (
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>
            {team.description}
          </div>
        )}
      </div>
      <div style={{ fontSize: '11px', color: '#818cf8', flexShrink: 0 }}>
        {team.memberCount ?? 0} members
      </div>
    </div>
  );
}

export default function OrgStructurePage() {
  const client = useApiClient();
  const orgId = useOrganizationId();
  const { data: deptsData, isLoading: deptsLoading, mutate: mutateDepts } = useDepartments();
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const {
    data: teamsData,
    isLoading: teamsLoading,
    mutate: mutateTeams,
  } = useTeams(selectedDeptId ?? undefined);

  const departments = deptsData?.data ?? [];
  const teams = teamsData?.data ?? [];

  const [showDeptForm, setShowDeptForm] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [addingDept, setAddingDept] = useState(false);
  const [deptError, setDeptError] = useState<string | null>(null);

  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [addingTeam, setAddingTeam] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 3000);
  };

  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !deptName.trim()) return;
    setAddingDept(true);
    setDeptError(null);
    try {
      await client.post('/api/v1/people/departments', {
        body: {
          organizationId: orgId,
          name: deptName.trim(),
          description: deptDesc.trim() || undefined,
        },
      });
      flash('Department created.');
      setDeptName('');
      setDeptDesc('');
      setShowDeptForm(false);
      void mutateDepts();
    } catch {
      setDeptError('Failed to create department.');
    } finally {
      setAddingDept(false);
    }
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !teamName.trim() || !selectedDeptId) return;
    setAddingTeam(true);
    setTeamError(null);
    try {
      await client.post('/api/v1/people/teams', {
        body: {
          organizationId: orgId,
          departmentId: selectedDeptId,
          name: teamName.trim(),
          description: teamDesc.trim() || undefined,
        },
      });
      flash('Team created.');
      setTeamName('');
      setTeamDesc('');
      setShowTeamForm(false);
      void mutateTeams();
    } catch {
      setTeamError('Failed to create team.');
    } finally {
      setAddingTeam(false);
    }
  };

  const selectedDept = departments.find((d) => d.id === selectedDeptId);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--mc-bg)',
        padding: '32px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
            Org Structure
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
            {departments.length} departments · manage teams and reporting lines
          </p>
        </div>

        {successMsg && (
          <div
            style={{
              background: '#22c55e22',
              border: '1px solid #22c55e',
              color: '#22c55e',
              borderRadius: '8px',
              padding: '10px 16px',
              marginBottom: '16px',
              fontSize: '13px',
            }}
          >
            {successMsg}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px' }}>
          {/* Left: Department list */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Departments
              </span>
              <button
                onClick={() => {
                  setShowDeptForm((v) => !v);
                }}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--mc-accent)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {showDeptForm ? 'Cancel' : '+ New'}
              </button>
            </div>

            {showDeptForm && (
              <form
                onSubmit={(e) => {
                  void handleAddDept(e);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  marginBottom: '12px',
                  padding: '12px',
                  background: 'var(--mc-card)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '8px',
                }}
              >
                <input
                  type="text"
                  placeholder="Department name *"
                  value={deptName}
                  required
                  onChange={(e) => {
                    setDeptName(e.target.value);
                  }}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '12px',
                  }}
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={deptDesc}
                  onChange={(e) => {
                    setDeptDesc(e.target.value);
                  }}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '12px',
                  }}
                />
                {deptError && <div style={{ color: '#ef4444', fontSize: '11px' }}>{deptError}</div>}
                <button
                  type="submit"
                  disabled={addingDept}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--mc-accent)',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: addingDept ? 'not-allowed' : 'pointer',
                    opacity: addingDept ? 0.7 : 1,
                  }}
                >
                  {addingDept ? 'Creating…' : 'Create'}
                </button>
              </form>
            )}

            {deptsLoading && (
              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: '13px',
                  padding: '20px 0',
                  textAlign: 'center',
                }}
              >
                Loading…
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {departments.map((dept) => (
                <DeptCard
                  key={dept.id}
                  dept={dept}
                  onSelect={setSelectedDeptId}
                  selected={dept.id === selectedDeptId}
                />
              ))}
              {!deptsLoading && departments.length === 0 && (
                <div
                  style={{
                    color: 'var(--muted)',
                    fontSize: '13px',
                    textAlign: 'center',
                    padding: '24px 0',
                  }}
                >
                  No departments yet.
                </div>
              )}
            </div>
          </div>

          {/* Right: Teams panel */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {selectedDept ? `Teams — ${selectedDept.name}` : 'Teams'}
              </span>
              {selectedDeptId && (
                <button
                  onClick={() => {
                    setShowTeamForm((v) => !v);
                  }}
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--mc-accent)',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  {showTeamForm ? 'Cancel' : '+ New Team'}
                </button>
              )}
            </div>

            {!selectedDeptId && (
              <div
                style={{
                  background: 'var(--mc-card)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '10px',
                  padding: '48px',
                  textAlign: 'center',
                  color: 'var(--muted)',
                  fontSize: '13px',
                }}
              >
                Select a department to view its teams.
              </div>
            )}

            {selectedDeptId && showTeamForm && (
              <form
                onSubmit={(e) => {
                  void handleAddTeam(e);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  marginBottom: '12px',
                  padding: '12px',
                  background: 'var(--mc-card)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '8px',
                }}
              >
                <input
                  type="text"
                  placeholder="Team name *"
                  value={teamName}
                  required
                  onChange={(e) => {
                    setTeamName(e.target.value);
                  }}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '12px',
                  }}
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={teamDesc}
                  onChange={(e) => {
                    setTeamDesc(e.target.value);
                  }}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--mc-border)',
                    background: 'var(--mc-bg)',
                    color: 'var(--fg)',
                    fontSize: '12px',
                  }}
                />
                {teamError && <div style={{ color: '#ef4444', fontSize: '11px' }}>{teamError}</div>}
                <button
                  type="submit"
                  disabled={addingTeam}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--mc-accent)',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: addingTeam ? 'not-allowed' : 'pointer',
                    opacity: addingTeam ? 0.7 : 1,
                  }}
                >
                  {addingTeam ? 'Creating…' : 'Create Team'}
                </button>
              </form>
            )}

            {selectedDeptId && teamsLoading && (
              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: '13px',
                  padding: '20px 0',
                  textAlign: 'center',
                }}
              >
                Loading…
              </div>
            )}

            {selectedDeptId && !teamsLoading && teams.length === 0 && (
              <div
                style={{
                  background: 'var(--mc-card)',
                  border: '1px solid var(--mc-border)',
                  borderRadius: '10px',
                  padding: '32px',
                  textAlign: 'center',
                  color: 'var(--muted)',
                  fontSize: '13px',
                }}
              >
                No teams in this department yet.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {teams.map((team) => (
                <TeamRow key={team.id} team={team} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
