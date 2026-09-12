use std::time::{Duration, Instant};

use crate::models::SystemStats;

#[derive(Clone)]
pub struct CpuSample {
    pub idle: u64,
    pub total: u64,
    pub last: f64,
    pub at: Instant,
}

impl Default for CpuSample {
    fn default() -> Self {
        CpuSample {
            idle: 0,
            total: 0,
            last: 0.0,
            at: Instant::now() - Duration::from_secs(10),
        }
    }
}

/// Cached network counters used to derive a per-second rate.
#[derive(Clone, Default)]
pub struct NetSample {
    pub rx: u64,
    pub tx: u64,
    pub at: Option<Instant>,
    pub rx_kbps: f64,
    pub tx_kbps: f64,
}

#[cfg(windows)]
mod imp {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetIfTable2, MIB_IF_TABLE2};
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    use windows::Win32::System::Threading::GetSystemTimes;

    fn filetime_to_u64(ft: &FILETIME) -> u64 {
        ((ft.dwHighDateTime as u64) << 32) | ft.dwLowDateTime as u64
    }

    pub fn cpu_times() -> (u64, u64) {
        unsafe {
            let mut idle = FILETIME::default();
            let mut kernel = FILETIME::default();
            let mut user = FILETIME::default();
            if GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user)).is_ok() {
                (filetime_to_u64(&idle), filetime_to_u64(&kernel) + filetime_to_u64(&user))
            } else {
                (0, 0)
            }
        }
    }

    pub fn memory() -> (f64, f64, f64) {
        unsafe {
            let mut mem: MEMORYSTATUSEX = std::mem::zeroed();
            mem.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
            if GlobalMemoryStatusEx(&mut mem).is_ok() {
                let total = mem.ullTotalPhys as f64 / (1024.0 * 1024.0 * 1024.0);
                let used = (mem.ullTotalPhys - mem.ullAvailPhys) as f64 / (1024.0 * 1024.0 * 1024.0);
                (mem.dwMemoryLoad as f64, used, total)
            } else {
                (0.0, 0.0, 0.0)
            }
        }
    }

    /// Total bytes received/transmitted across every interface.
    pub fn net_totals() -> Option<(u64, u64)> {
        unsafe {
            let mut table: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
            if GetIfTable2(&mut table).is_err() || table.is_null() {
                return None;
            }
            let count = (*table).NumEntries as usize;
            let rows = std::slice::from_raw_parts((*table).Table.as_ptr(), count);
            let mut rx: u64 = 0;
            let mut tx: u64 = 0;
            for row in rows {
                rx = rx.saturating_add(row.InOctets);
                tx = tx.saturating_add(row.OutOctets);
            }
            FreeMibTable(table as *const core::ffi::c_void);
            Some((rx, tx))
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn cpu_times() -> (u64, u64) {
        (0, 0)
    }
    pub fn memory() -> (f64, f64, f64) {
        (0.0, 0.0, 0.0)
    }
    pub fn net_totals() -> Option<(u64, u64)> {
        None
    }
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

/// Collect a system snapshot. Collectors that are disabled are not sampled at
/// all, so Dev Pilot does no unnecessary work.
pub fn stats(
    cpu: &mut CpuSample,
    net: &mut NetSample,
    cpu_enabled: bool,
    ram_enabled: bool,
    network_enabled: bool,
) -> SystemStats {
    let cpu_percent = if cpu_enabled {
        let (idle, total) = imp::cpu_times();
        let percent = if total > 0 && cpu.idle > 0 {
            let idle_d = idle.saturating_sub(cpu.idle);
            let total_d = total.saturating_sub(cpu.total);
            if total_d > 0 {
                (1.0 - idle_d as f64 / total_d as f64) * 100.0
            } else {
                cpu.last
            }
        } else {
            0.0
        };
        cpu.idle = idle;
        cpu.total = total;
        cpu.at = Instant::now();
        cpu.last = percent;
        percent.round()
    } else {
        0.0
    };

    let (ram_pct, ram_used, ram_total) = if ram_enabled {
        imp::memory()
    } else {
        (0.0, 0.0, 0.0)
    };

    if network_enabled {
        if let Some((rx, tx)) = imp::net_totals() {
            if let Some(prev_at) = net.at {
                let dt = prev_at.elapsed().as_secs_f64();
                if dt > 0.05 {
                    let rx_d = rx.saturating_sub(net.rx) as f64 / dt;
                    let tx_d = tx.saturating_sub(net.tx) as f64 / dt;
                    net.rx_kbps = (rx_d / 1024.0).max(0.0);
                    net.tx_kbps = (tx_d / 1024.0).max(0.0);
                }
            }
            net.rx = rx;
            net.tx = tx;
            net.at = Some(Instant::now());
        }
    } else {
        net.at = None;
        net.rx_kbps = 0.0;
        net.tx_kbps = 0.0;
    }

    SystemStats {
        cpu_enabled,
        ram_enabled,
        network_enabled,
        cpu_percent,
        ram_percent: ram_pct,
        ram_used_gb: round1(ram_used),
        ram_total_gb: round1(ram_total),
        net_rx_kbps: round1(net.rx_kbps),
        net_tx_kbps: round1(net.tx_kbps),
    }
}
